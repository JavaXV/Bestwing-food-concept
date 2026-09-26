const express = require("express");
const axios = require("axios");
const crypto = require("crypto");

const pool = require("../config/db");

const {
    activateUser
} = require("../services/account");

const {
    authenticate
} = require("../middleware/auth");

require("dotenv").config();

const router = express.Router();


/*
|--------------------------------------------------------------------------
| CONFIGURATION
|--------------------------------------------------------------------------
*/

const PAYSTACK_SECRET_KEY =
    process.env.PAYSTACK_SECRET_KEY;

const BASE_URL =
    process.env.BASE_URL ||
    "https://bestwing.com.ng";

const REGISTRATION_FEE = 3000;

const ACCOUNT_CREATION_FEE = 3000;


/*
|--------------------------------------------------------------------------
| CHECK PAYSTACK KEY
|--------------------------------------------------------------------------
*/

if (!PAYSTACK_SECRET_KEY) {

    console.error(
        "WARNING: PAYSTACK_SECRET_KEY is not configured."
    );

}




/*
|--------------------------------------------------------------------------
| FUND EXISTING VIRTUAL ACCOUNT
|--------------------------------------------------------------------------
|
| POST /api/payments/fund/initialize
|
| JWT REQUIRED
|
| wallet_transactions:
|
| payment_method = 'paystack'
| status         = 'pending'
|
| The wallet balance is NOT credited here.
| Balance is credited only after successful Paystack verification.
|
|--------------------------------------------------------------------------
*/

router.post(
    "/fund/initialize",
    authenticate,
    async (req, res) => {

        let connection;

        try {

            const userId =
                Number(req.user.id);

            const selectedAccount =
                String(
                    req.body.accountno || ""
                ).trim();

            const amountNGN =
                Number(req.body.amount);


            /*
            |--------------------------------------------------------------------------
            | VALIDATE USER
            |--------------------------------------------------------------------------
            */

            if (
                !Number.isInteger(userId) ||
                userId <= 0
            ) {

                return res.status(401).json({

                    success: false,

                    message:
                        "Invalid authenticated user."

                });

            }


            /*
            |--------------------------------------------------------------------------
            | VALIDATE ACCOUNT NUMBER
            |--------------------------------------------------------------------------
            */

            if (!selectedAccount) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Please select a virtual account."

                });

            }


            /*
            |--------------------------------------------------------------------------
            | VALIDATE AMOUNT
            |--------------------------------------------------------------------------
            */

            if (
                !Number.isFinite(amountNGN) ||
                amountNGN <= 0
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Enter a valid amount."

                });

            }


            /*
            |--------------------------------------------------------------------------
            | LOAD USER
            |--------------------------------------------------------------------------
            */

            const [users] =
                await pool.execute(
                    `
                    SELECT
                        id,
                        email,
                        phone_number
                    FROM users
                    WHERE id = ?
                    LIMIT 1
                    `,
                    [
                        userId
                    ]
                );


            if (!users.length) {

                return res.status(404).json({

                    success: false,

                    message:
                        "User account not found."

                });

            }


            const user =
                users[0];


            /*
            |--------------------------------------------------------------------------
            | VERIFY VIRTUAL ACCOUNT
            |--------------------------------------------------------------------------
            */

            const [accounts] =
                await pool.execute(
                    `
                    SELECT
                        id,
                        user_id,
                        accountno,
                        account_name,
                        status,
                        balance
                    FROM virtual_account
                    WHERE user_id = ?
                    AND accountno = ?
                    LIMIT 1
                    `,
                    [
                        userId,
                        selectedAccount
                    ]
                );


            if (!accounts.length) {

                return res.status(404).json({

                    success: false,

                    message:
                        `Selected virtual account ${selectedAccount} was not found.`

                });

            }


            const account =
                accounts[0];


            /*
            |--------------------------------------------------------------------------
            | CHECK ACCOUNT STATUS
            |--------------------------------------------------------------------------
            */

            if (
                account.status !==
                "active"
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Selected virtual account is inactive."

                });

            }


            /*
            |--------------------------------------------------------------------------
            | PREVENT DUPLICATE PENDING FUNDING
            |--------------------------------------------------------------------------
            |
            | This prevents double-clicks / duplicate frontend requests
            | from creating two pending Paystack funding transactions.
            |
            |--------------------------------------------------------------------------
            */

            const [pendingFunding] =
                await pool.execute(
                    `
                    SELECT
                        id,
                        amount,
                        reference,
                        status
                    FROM payments
                    WHERE user_id = ?
                    AND method = 'paystack'
                    AND reference LIKE 'FUND_%'
                    AND status = 'pending'
                    ORDER BY id DESC
                    LIMIT 1
                    `,
                    [
                        userId
                    ]
                );


            // if (pendingFunding.length) {

            //     return res.status(409).json({

            //         success: false,

            //         message:
            //             "You already have a wallet funding payment awaiting verification.",

            //         reference:
            //             pendingFunding[0].reference,

            //         amount:
            //             Number(
            //                 pendingFunding[0].amount
            //             )

            //     });

            // }


            /*
            |--------------------------------------------------------------------------
            | CREATE UNIQUE REFERENCE
            |--------------------------------------------------------------------------
            */

            const reference =
                "FUND_" +
                Date.now() +
                "_" +
                crypto
                    .randomBytes(5)
                    .toString("hex");


            /*
            |--------------------------------------------------------------------------
            | DATABASE TRANSACTION
            |--------------------------------------------------------------------------
            |
            | Create BOTH records together.
            |
            | payments:
            |     method = paystack
            |     status = pending
            |
            | wallet_transactions:
            |     payment_method = paystack
            |     status = pending
            |
            |--------------------------------------------------------------------------
            */

            connection =
                await pool.getConnection();

            await connection.beginTransaction();


            /*
            |--------------------------------------------------------------------------
            | SAVE PAYMENT
            |--------------------------------------------------------------------------
            */

            const [paymentResult] =
                await connection.execute(
                    `
                    INSERT INTO payments
                    (
                        user_id,
                        method,
                        amount,
                        reference,
                        status
                    )
                    VALUES
                    (
                        ?,
                        'paystack',
                        ?,
                        ?,
                        'pending'
                    )
                    `,
                    [
                        userId,
                        amountNGN,
                        reference
                    ]
                );


            /*
            |--------------------------------------------------------------------------
            | SAVE WALLET TRANSACTION
            |--------------------------------------------------------------------------
            |
            | IMPORTANT:
            |
            | payment_method = paystack
            | status         = pending
            |
            | No money is added to virtual_account.balance here.
            |
            |--------------------------------------------------------------------------
            */

            const [walletTransactionResult] =
                await connection.execute(
                    `
                    INSERT INTO wallet_transactions
                    (
                        user_id,
                        accountno,
                        amount,
                        reference,
                        payment_method,
                        status
                    )
                    VALUES
                    (
                        ?,
                        ?,
                        ?,
                        ?,
                        'paystack',
                        'pending'
                    )
                    `,
                    [
                        userId,
                        account.accountno,
                        amountNGN,
                        reference
                    ]
                );


            await connection.commit();


            console.log(
                "WALLET PAYMENT CREATED:",
                {
                    paymentId:
                        paymentResult.insertId,

                    walletTransactionId:
                        walletTransactionResult.insertId,

                    userId,

                    accountno:
                        account.accountno,

                    amount:
                        amountNGN,

                    payment_method:
                        "paystack",

                    status:
                        "pending",

                    reference
                }
            );


            /*
            |--------------------------------------------------------------------------
            | PAYSTACK EMAIL
            |--------------------------------------------------------------------------
            */

            const email =
                user.email ||
                `${user.phone_number}@bestwing.com.ng`;


            /*
            |--------------------------------------------------------------------------
            | INITIALIZE PAYSTACK
            |--------------------------------------------------------------------------
            */

            let paystackResponse;

            try {

                paystackResponse =
                    await axios.post(
                        "https://api.paystack.co/transaction/initialize",
                        {

                            email,

                            amount:
                                Math.round(
                                    amountNGN * 100
                                ),

                            reference,

                            callback_url:
                                process.env.PAYSTACK_CALLBACK_URL_PAY ||
                                `${BASE_URL}/payment.html?verify=1`,

                            metadata: {

                                payment_type:
                                    "wallet_funding",

                                user_id:
                                    userId,

                                account_id:
                                    account.id,

                                accountno:
                                    account.accountno,

                                account_name:
                                    account.account_name

                            }

                        },
                        {
                            headers: {

                                Authorization:
                                    `Bearer ${PAYSTACK_SECRET_KEY}`,

                                "Content-Type":
                                    "application/json"

                            }

                        }
                    );

            } catch (paystackError) {

                /*
                |--------------------------------------------------------------------------
                | PAYSTACK INITIALIZATION FAILED
                |--------------------------------------------------------------------------
                |
                | The Paystack payment could not be created.
                |
                | Mark BOTH database records as failed.
                |
                |--------------------------------------------------------------------------
                */

                await pool.execute(
                    `
                    UPDATE payments
                    SET status = 'failed'
                    WHERE id = ?
                    `,
                    [
                        paymentResult.insertId
                    ]
                );


                await pool.execute(
                    `
                    UPDATE wallet_transactions
                    SET status = 'failed'
                    WHERE id = ?
                    `,
                    [
                        walletTransactionResult.insertId
                    ]
                );


                throw paystackError;

            }


            /*
            |--------------------------------------------------------------------------
            | VALIDATE PAYSTACK RESPONSE
            |--------------------------------------------------------------------------
            */

            if (
                !paystackResponse.data ||
                !paystackResponse.data.status ||
                !paystackResponse.data.data
            ) {

                await pool.execute(
                    `
                    UPDATE payments
                    SET status = 'failed'
                    WHERE id = ?
                    `,
                    [
                        paymentResult.insertId
                    ]
                );


                await pool.execute(
                    `
                    UPDATE wallet_transactions
                    SET status = 'failed'
                    WHERE id = ?
                    `,
                    [
                        walletTransactionResult.insertId
                    ]
                );


                throw new Error(
                    "Invalid response received from Paystack."
                );

            }


            const data =
                paystackResponse.data.data;


            /*
            |--------------------------------------------------------------------------
            | SUCCESS
            |--------------------------------------------------------------------------
            */

            console.log(
                "PAYSTACK FUND INITIALIZED:",
                {
                    reference,

                    accountno:
                        account.accountno,

                    amount:
                        amountNGN,

                    payment_method:
                        "paystack",

                    status:
                        "pending"
                }
            );


            return res.json({

                success: true,

                message:
                    "Payment initialized successfully.",

                reference,

                authorization_url:
                    data.authorization_url,

                access_code:
                    data.access_code,

                accountno:
                    account.accountno,

                account_name:
                    account.account_name,

                amount:
                    amountNGN,

                payment_method:
                    "paystack",

                status:
                    "pending"

            });


        } catch (error) {

            if (connection) {

                try {
                    await connection.rollback();
                } catch (rollbackError) {

                    console.error(
                        "ROLLBACK ERROR:",
                        rollbackError
                    );

                }

            }


            console.error(
                "FUND INITIALIZATION ERROR:",
                error.response?.data ||
                error.message ||
                error
            );


            return res.status(500).json({

                success: false,

                message:
                    error.response?.data?.message ||
                    error.message ||
                    "Unable to initialize funding payment."

            });

        } finally {

            if (connection) {
                connection.release();
            }

        }

    }
);




/*
|--------------------------------------------------------------------------
| MANUAL REGISTRATION PAYMENT
|--------------------------------------------------------------------------
|
| POST /api/payments/manual
|
| JWT NOT REQUIRED
|
| Used before account activation.
|
|--------------------------------------------------------------------------
*/

router.post(
    "/manual",
    async (req, res) => {

        try {

            const userId =
                Number(req.body.user_id);

            const amount =
                Number(
                    req.body.amount ||
                    REGISTRATION_FEE
                );

            const paymentMethod =
                String(
                    req.body.payment_method ||
                    "BANK_TRANSFER"
                ).trim();


            console.log(
                "MANUAL PAYMENT REQUEST:",
                {
                    userId,
                    amount,
                    paymentMethod
                }
            );


            /*
            |--------------------------------------------------------------------------
            | VALIDATE USER
            |--------------------------------------------------------------------------
            */

            if (
                !Number.isInteger(userId) ||
                userId <= 0
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "A valid user ID is required."

                });

            }


            /*
            |--------------------------------------------------------------------------
            | VALIDATE AMOUNT
            |--------------------------------------------------------------------------
            */

            if (
                !Number.isFinite(amount) ||
                amount <= 0
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Invalid payment amount."

                });

            }


            /*
            |--------------------------------------------------------------------------
            | CHECK USER
            |--------------------------------------------------------------------------
            */

            const [users] =
                await pool.execute(
                    `
                    SELECT
                        id,
                        email,
                        phone_number
                    FROM users
                    WHERE id = ?
                    LIMIT 1
                    `,
                    [
                        userId
                    ]
                );


            if (!users.length) {

                return res.status(404).json({

                    success: false,

                    message:
                        "User account not found."

                });

            }


            /*
            |--------------------------------------------------------------------------
            | CHECK PENDING PAYMENT
            |--------------------------------------------------------------------------
            */

            const [existing] =
                await pool.execute(
                    `
                    SELECT
                        id,
                        amount,
                        reference,
                        status
                    FROM payments
                    WHERE user_id = ?
                    AND method = 'manual'
                    AND reference LIKE 'REG_MANUAL_%'
                    AND status = 'pending'
                    LIMIT 1
                    `,
                    [
                        userId
                    ]
                );


            if (existing.length) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Your manual registration payment is already awaiting admin approval.",

                    reference:
                        existing[0].reference

                });

            }


            /*
            |--------------------------------------------------------------------------
            | GENERATE REFERENCE
            |--------------------------------------------------------------------------
            */

            const reference =
                "REG_MANUAL_" +
                Date.now() +
                "_" +
                crypto
                    .randomBytes(5)
                    .toString("hex");


            /*
            |--------------------------------------------------------------------------
            | SAVE PAYMENT
            |--------------------------------------------------------------------------
            */

            const [paymentResult] =
                await pool.execute(
                    `
                    INSERT INTO payments
                    (
                        user_id,
                        method,
                        amount,
                        reference,
                        status
                    )
                    VALUES
                    (
                        ?,
                        'manual',
                        ?,
                        ?,
                        'pending'
                    )
                    `,
                    [
                        userId,
                        amount,
                        reference
                    ]
                );


            console.log(
                "MANUAL PAYMENT SUBMITTED:",
                {
                    paymentId:
                        paymentResult.insertId,

                    userId,

                    amount,

                    paymentMethod,

                    reference
                }
            );


            return res.status(201).json({

                success: true,

                message:
                    "Manual payment submitted successfully. Admin approval is required.",

                payment: {

                    id:
                        paymentResult.insertId,

                    user_id:
                        userId,

                    amount,

                    method:
                        "manual",

                    payment_method:
                        paymentMethod,

                    reference,

                    status:
                        "pending"

                }

            });


        } catch (error) {

            console.error(
                "MANUAL PAYMENT ERROR:",
                error
            );


            return res.status(500).json({

                success: false,

                message:
                    error.sqlMessage ||
                    error.message ||
                    "Unable to submit manual payment."

            });

        }

    }
);


/*
|--------------------------------------------------------------------------
| REGISTRATION PAYMENT - PAYSTACK
|--------------------------------------------------------------------------
|
| POST /api/payments/registration/initialize
|
| IMPORTANT:
|
| NO JWT AUTHENTICATION.
|
| The user has not logged in yet.
|
|--------------------------------------------------------------------------
*/

router.post(
    "/registration/initialize",
    async (req, res) => {

        try {

            const userId =
                Number(req.body.user_id);


            /*
            |--------------------------------------------------------------------------
            | VALIDATE USER ID
            |--------------------------------------------------------------------------
            */

            if (
                !Number.isInteger(userId) ||
                userId <= 0
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "A valid user ID is required."

                });

            }


            /*
            |--------------------------------------------------------------------------
            | FIND USER
            |--------------------------------------------------------------------------
            */

            const [users] =
                await pool.execute(
                    `
                    SELECT
                        id,
                        full_name,
                        email,
                        phone_number
                    FROM users
                    WHERE id = ?
                    LIMIT 1
                    `,
                    [
                        userId
                    ]
                );


            if (!users.length) {

                return res.status(404).json({

                    success: false,

                    message:
                        "User account not found."

                });

            }


            const user =
                users[0];


            /*
            |--------------------------------------------------------------------------
            | CHECK EXISTING PENDING REGISTRATION PAYMENT
            |--------------------------------------------------------------------------
            */

            const [existingPayments] =
                await pool.execute(
                    `
                    SELECT
                        id,
                        amount,
                        reference,
                        status
                    FROM payments
                    WHERE user_id = ?
                    AND method = 'paystack'
                    AND reference LIKE 'REG_PAY_%'
                    AND status = 'pending'
                    ORDER BY id DESC
                    LIMIT 1
                    `,
                    [
                        userId
                    ]
                );


            if (existingPayments.length) {

                /*
                |--------------------------------------------------------------------------
                | RETURN EXISTING REFERENCE
                |--------------------------------------------------------------------------
                |
                | We do not create multiple pending registration
                | payments for the same user.
                |
                |--------------------------------------------------------------------------
                */

                return res.json({

                    success: true,

                    message:
                        "A registration payment is already pending.",

                    reference:
                        existingPayments[0].reference,

                    amount:
                        Number(
                            existingPayments[0].amount
                        )

                });

            }


            /*
            |--------------------------------------------------------------------------
            | GENERATE UNIQUE REFERENCE
            |--------------------------------------------------------------------------
            */

            const reference =
                "REG_PAY_" +
                Date.now() +
                "_" +
                crypto
                    .randomBytes(5)
                    .toString("hex");


            /*
            |--------------------------------------------------------------------------
            | EMAIL
            |--------------------------------------------------------------------------
            */

            const email =
                user.email ||
                `${user.phone_number}@bestwing.com.ng`;


            /*
            |--------------------------------------------------------------------------
            | SAVE PENDING PAYMENT
            |--------------------------------------------------------------------------
            */

            await pool.execute(
                `
                INSERT INTO payments
                (
                    user_id,
                    method,
                    amount,
                    reference,
                    status
                )
                VALUES
                (
                    ?,
                    'paystack',
                    ?,
                    ?,
                    'pending'
                )
                `,
                [
                    userId,
                    REGISTRATION_FEE,
                    reference
                ]
            );


            /*
            |--------------------------------------------------------------------------
            | INITIALIZE PAYSTACK
            |--------------------------------------------------------------------------
            */

            const paystackResponse =
                await axios.post(
                    "https://api.paystack.co/transaction/initialize",
                    {

                        email,

                        amount:
                            REGISTRATION_FEE * 100,

                        reference,

                        callback_url:
                            process.env.PAYSTACK_CALLBACK_URL_PAYS ||
                            `${BASE_URL}/payment.html?verify=1`,

                        metadata: {

                            payment_type:
                                "registration",

                            user_id:
                                userId,

                            registration_fee:
                                REGISTRATION_FEE

                        }

                    },
                    {
                        headers: {

                            Authorization:
                                `Bearer ${PAYSTACK_SECRET_KEY}`,

                            "Content-Type":
                                "application/json"

                        }

                    }
                );


            /*
            |--------------------------------------------------------------------------
            | VALIDATE PAYSTACK
            |--------------------------------------------------------------------------
            */

            if (
                !paystackResponse.data ||
                !paystackResponse.data.status ||
                !paystackResponse.data.data
            ) {

                throw new Error(
                    "Invalid response received from Paystack."
                );

            }


            const paystackData =
                paystackResponse.data.data;


            console.log(
                "REGISTRATION PAYSTACK INITIALIZED:",
                {
                    userId,

                    amount:
                        REGISTRATION_FEE,

                    reference
                }
            );


            return res.json({

                success: true,

                message:
                    "Registration payment initialized successfully.",

                reference,

                authorization_url:
                    paystackData.authorization_url,

                access_code:
                    paystackData.access_code,

                amount:
                    REGISTRATION_FEE

            });


        } catch (error) {

            console.error(
                "REGISTRATION PAYSTACK INITIALIZATION ERROR:",
                error.response?.data ||
                error.message ||
                error
            );


            return res.status(500).json({

                success: false,

                message:
                    error.response?.data?.message ||
                    error.message ||
                    "Unable to initialize registration payment."

            });

        }

    }
);


/*
|--------------------------------------------------------------------------
| ADD NEW ACCOUNT USING EXISTING VIRTUAL ACCOUNT
|--------------------------------------------------------------------------
|
| POST /api/payments/accounts/add
|
| JWT REQUIRED
|
| Deducts ₦5,000 from an existing virtual account.
|
|--------------------------------------------------------------------------
*/

router.post(
    "/accounts/add",
    authenticate,
    async (req, res) => {

        let connection;

        try {

            const userId =
                Number(req.user.id);

            const accountno =
                String(
                    req.body.accountno || ""
                ).trim();


            if (
                !Number.isInteger(userId) ||
                userId <= 0
            ) {

                return res.status(401).json({

                    success: false,

                    message:
                        "Invalid authenticated user."

                });

            }


            if (!accountno) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Please select the virtual account you want to use."

                });

            }


            console.log(
                "VIRTUAL ACCOUNT PAYMENT REQUEST:",
                {
                    userId,
                    accountno
                }
            );


            connection =
                await pool.getConnection();


            await connection.beginTransaction();


            /*
            |--------------------------------------------------------------------------
            | LOCK SOURCE ACCOUNT
            |--------------------------------------------------------------------------
            */

            const [accounts] =
                await connection.execute(
                    `
                    SELECT
                        id,
                        user_id,
                        accountno,
                        account_name,
                        status,
                        balance
                    FROM virtual_account
                    WHERE user_id = ?
                    AND accountno = ?
                    LIMIT 1
                    FOR UPDATE
                    `,
                    [
                        userId,
                        accountno
                    ]
                );


            if (!accounts.length) {

                await connection.rollback();

                return res.status(404).json({

                    success: false,

                    message:
                        `Virtual account ${accountno} was not found for your account.`

                });

            }


            const sourceAccount =
                accounts[0];


            /*
            |--------------------------------------------------------------------------
            | CHECK STATUS
            |--------------------------------------------------------------------------
            */

            if (
                sourceAccount.status !==
                "active"
            ) {

                await connection.rollback();

                return res.status(400).json({

                    success: false,

                    message:
                        `Virtual account ${accountno} is inactive.`

                });

            }


            /*
            |--------------------------------------------------------------------------
            | CHECK BALANCE
            |--------------------------------------------------------------------------
            */

            const currentBalance =
                Number(
                    sourceAccount.balance || 0
                );


            if (
                currentBalance <
                ACCOUNT_CREATION_FEE
            ) {

                await connection.rollback();

                return res.status(400).json({

                    success: false,

                    message:
                        `Insufficient balance in account ${accountno}. Available balance: ₦${currentBalance.toLocaleString("en-NG", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2
                        })}`

                });

            }


            /*
            |--------------------------------------------------------------------------
            | DEDUCT FEE
            |--------------------------------------------------------------------------
            */

            const [deductionResult] =
                await connection.execute(
                    `
                    UPDATE virtual_account
                    SET balance = balance - ?
                    WHERE id = ?
                    AND user_id = ?
                    AND accountno = ?
                    AND balance >= ?
                    `,
                    [
                        ACCOUNT_CREATION_FEE,
                        sourceAccount.id,
                        userId,
                        accountno,
                        ACCOUNT_CREATION_FEE
                    ]
                );


            if (
                deductionResult.affectedRows !== 1
            ) {

                throw new Error(
                    "The ₦5,000 deduction could not be completed."
                );

            }


            const remainingBalance =
                currentBalance -
                ACCOUNT_CREATION_FEE;


            /*
            |--------------------------------------------------------------------------
            | GENERATE NEW ACCOUNT NUMBER
            |--------------------------------------------------------------------------
            */

            const year =
                new Date()
                    .getFullYear()
                    .toString();


            let newAccountNo = null;


            for (
                let attempt = 0;
                attempt < 50;
                attempt++
            ) {

                const randomPart =
                    crypto.randomInt(
                        10000,
                        100000
                    );


                const candidate =
                    "2" +
                    randomPart +
                    year;


                const [existing] =
                    await connection.execute(
                        `
                        SELECT id
                        FROM virtual_account
                        WHERE accountno = ?
                        LIMIT 1
                        `,
                        [
                            candidate
                        ]
                    );


                if (!existing.length) {

                    newAccountNo =
                        candidate;

                    break;

                }

            }


            if (!newAccountNo) {

                throw new Error(
                    "Unable to generate a unique virtual account number."
                );

            }


            /*
            |--------------------------------------------------------------------------
            | CREATE NEW ACCOUNT
            |--------------------------------------------------------------------------
            */

            const [newAccount] =
                await connection.execute(
                    `
                    INSERT INTO virtual_account
                    (
                        user_id,
                        accountno,
                        account_name,
                        status,
                        balance
                    )
                    VALUES
                    (
                        ?,
                        ?,
                        ?,
                        'active',
                        0
                    )
                    `,
                    [
                        userId,
                        newAccountNo,
                        sourceAccount.account_name
                    ]
                );


            /*
            |--------------------------------------------------------------------------
            | PAYMENT RECORD
            |--------------------------------------------------------------------------
            */

            const reference =
                "VACC_" +
                Date.now() +
                "_" +
                crypto
                    .randomBytes(5)
                    .toString("hex");


            await connection.execute(
                `
                INSERT INTO payments
                (
                    user_id,
                    method,
                    amount,
                    reference,
                    status
                )
                VALUES
                (
                    ?,
                    'virtual_account',
                    ?,
                    ?,
                    'success'
                )
                `,
                [
                    userId,
                    ACCOUNT_CREATION_FEE,
                    reference
                ]
            );


            await connection.commit();


            console.log(
                "VIRTUAL ACCOUNT PAYMENT COMPLETED:",
                {
                    userId,

                    sourceAccount:
                        accountno,

                    deducted:
                        ACCOUNT_CREATION_FEE,

                    remainingBalance,

                    newAccount:
                        newAccountNo,

                    reference
                }
            );


            return res.json({

                success: true,

                message:
                    `₦5,000 was deducted from account ${accountno} and your new virtual account was created successfully.`,

                payment: {

                    amount:
                        ACCOUNT_CREATION_FEE,

                    method:
                        "virtual_account",

                    reference,

                    source_accountno:
                        accountno,

                    source_account_balance:
                        remainingBalance

                },

                account: {

                    id:
                        newAccount.insertId,

                    accountno:
                        newAccountNo,

                    account_name:
                        sourceAccount.account_name,

                    status:
                        "active",

                    balance:
                        0

                }

            });


        } catch (error) {

            if (connection) {

                try {
                    await connection.rollback();
                } catch (rollbackError) {

                    console.error(
                        "ROLLBACK ERROR:",
                        rollbackError
                    );

                }

            }


            console.error(
                "VIRTUAL ACCOUNT PAYMENT ERROR:",
                error
            );


            return res.status(500).json({

                success: false,

                message:
                    error.message ||
                    "Unable to process virtual account payment."

            });

        } finally {

            if (connection) {
                connection.release();
            }

        }

    }
);


/*
|--------------------------------------------------------------------------
| ADD NEW ACCOUNT - PAY WITH PAYSTACK
|--------------------------------------------------------------------------
|
| POST /api/payments/accounts/add/initialize
|
| JWT REQUIRED
|
| This route is for logged-in users.
|
| DO NOT use this route for registration.
|
|--------------------------------------------------------------------------
*/

router.post(
    "/accounts/add/initialize",
    authenticate,
    async (req, res) => {

        try {

            const userId =
                Number(req.user.id);

            const accountno =
                String(
                    req.body.accountno || ""
                ).trim();


            if (
                !Number.isInteger(userId) ||
                userId <= 0
            ) {

                return res.status(401).json({

                    success: false,

                    message:
                        "Invalid authenticated user."

                });

            }


            if (!accountno) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Please select the virtual account you want to use."

                });

            }


            /*
            |--------------------------------------------------------------------------
            | LOAD USER
            |--------------------------------------------------------------------------
            */

            const [users] =
                await pool.execute(
                    `
                    SELECT
                        id,
                        email,
                        phone_number
                    FROM users
                    WHERE id = ?
                    LIMIT 1
                    `,
                    [
                        userId
                    ]
                );


            if (!users.length) {

                return res.status(404).json({

                    success: false,

                    message:
                        "User account not found."

                });

            }


            const user =
                users[0];


            /*
            |--------------------------------------------------------------------------
            | VERIFY ACCOUNT
            |--------------------------------------------------------------------------
            */

            const [accounts] =
                await pool.execute(
                    `
                    SELECT
                        id,
                        user_id,
                        accountno,
                        account_name,
                        status,
                        balance
                    FROM virtual_account
                    WHERE user_id = ?
                    AND accountno = ?
                    LIMIT 1
                    `,
                    [
                        userId,
                        accountno
                    ]
                );


            if (!accounts.length) {

                return res.status(404).json({

                    success: false,

                    message:
                        "Selected virtual account was not found."

                });

            }


            const account =
                accounts[0];


            if (
                account.status !==
                "active"
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Selected virtual account is inactive."

                });

            }


            /*
            |--------------------------------------------------------------------------
            | CHECK BALANCE
            |--------------------------------------------------------------------------
            */

            const balance =
                Number(
                    account.balance || 0
                );


            if (
                balance <
                ACCOUNT_CREATION_FEE
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        `Insufficient balance in account ${account.accountno}. Available balance: ₦${balance.toLocaleString("en-NG", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2
                        })}`

                });

            }


            /*
            |--------------------------------------------------------------------------
            | CREATE REFERENCE
            |--------------------------------------------------------------------------
            */

            const reference =
                "ADD_" +
                Date.now() +
                "_" +
                crypto
                    .randomBytes(5)
                    .toString("hex");


            /*
            |--------------------------------------------------------------------------
            | SAVE PENDING PAYMENT
            |--------------------------------------------------------------------------
            */

            await pool.execute(
                `
                INSERT INTO payments
                (
                    user_id,
                    method,
                    amount,
                    reference,
                    status
                )
                VALUES
                (
                    ?,
                    'paystack',
                    ?,
                    ?,
                    'pending'
                )
                `,
                [
                    userId,
                    ACCOUNT_CREATION_FEE,
                    reference
                ]
            );


            /*
            |--------------------------------------------------------------------------
            | PAYSTACK EMAIL
            |--------------------------------------------------------------------------
            */

            const email =
                user.email ||
                `${user.phone_number}@bestwing.com.ng`;


            /*
            |--------------------------------------------------------------------------
            | PAYSTACK INITIALIZATION
            |--------------------------------------------------------------------------
            */

            const paystackResponse =
                await axios.post(
                    "https://api.paystack.co/transaction/initialize",
                    {

                        email,

                        amount:
                            ACCOUNT_CREATION_FEE * 100,

                        reference,

                        callback_url:
                            process.env.PAYSTACK_CALLBACK_URL_PAY ||
                            `${BASE_URL}/payment.html?verify=1`,

                        metadata: {

                            payment_type:
                                "account_creation",

                            user_id:
                                userId,

                            account_id:
                                account.id,

                            accountno:
                                account.accountno,

                            account_name:
                                account.account_name,

                            creation_fee:
                                ACCOUNT_CREATION_FEE

                        }

                    },
                    {
                        headers: {

                            Authorization:
                                `Bearer ${PAYSTACK_SECRET_KEY}`,

                            "Content-Type":
                                "application/json"

                        }

                    }
                );


            if (
                !paystackResponse.data ||
                !paystackResponse.data.status ||
                !paystackResponse.data.data
            ) {

                throw new Error(
                    "Invalid response received from Paystack."
                );

            }


            const paystackData =
                paystackResponse.data.data;


            console.log(
                "ADD ACCOUNT PAYSTACK INITIALIZED:",
                {
                    userId,
                    accountno:
                        account.accountno,
                    reference,
                    amount:
                        ACCOUNT_CREATION_FEE
                }
            );


            return res.json({

                success: true,

                message:
                    "Account creation payment initialized.",

                reference,

                authorization_url:
                    paystackData.authorization_url,

                access_code:
                    paystackData.access_code,

                accountno:
                    account.accountno,

                account_name:
                    account.account_name,

                amount:
                    ACCOUNT_CREATION_FEE

            });


        } catch (error) {

            console.error(
                "ADD ACCOUNT PAYSTACK INITIALIZATION ERROR:",
                error.response?.data ||
                error.message ||
                error
            );


            return res.status(500).json({

                success: false,

                message:
                    error.response?.data?.message ||
                    error.message ||
                    "Unable to initialize account creation payment."

            });

        }

    }
);


/*
|--------------------------------------------------------------------------
| VERIFY REGISTRATION PAYSTACK PAYMENT
|--------------------------------------------------------------------------
|
| GET /api/payments/registration/verify/:reference
|
| NO JWT REQUIRED
|
|--------------------------------------------------------------------------
*/

router.get(
    "/registration/verify/:reference",
    async (req, res) => {

        const reference =
            String(
                req.params.reference || ""
            ).trim();


        if (!reference) {

            return res.status(400).json({

                success: false,

                message:
                    "Payment reference is required."

            });

        }


        let connection;


        try {

            /*
            |--------------------------------------------------------------------------
            | FIND PAYMENT
            |--------------------------------------------------------------------------
            */

            const [payments] =
                await pool.execute(
                    `
                    SELECT
                        id,
                        user_id,
                        amount,
                        method,
                        reference,
                        status
                    FROM payments
                    WHERE reference = ?
                    AND method = 'paystack'
                    AND reference LIKE 'REG_PAY_%'
                    LIMIT 1
                    `,
                    [
                        reference
                    ]
                );


            if (!payments.length) {

                return res.status(404).json({

                    success: false,

                    message:
                        "Registration payment was not found."

                });

            }


            const payment =
                payments[0];


            /*
            |--------------------------------------------------------------------------
            | ALREADY SUCCESSFUL
            |--------------------------------------------------------------------------
            */

            if (
                payment.status ===
                "success"
            ) {

                return res.json({

                    success: true,

                    message:
                        "Registration payment was already verified.",

                    reference,

                    amount:
                        Number(
                            payment.amount
                        ),

                    user_id:
                        payment.user_id

                });

            }


            /*
            |--------------------------------------------------------------------------
            | VERIFY WITH PAYSTACK
            |--------------------------------------------------------------------------
            */

            const paystackResponse =
                await axios.get(
                    "https://api.paystack.co/transaction/verify/" +
                    encodeURIComponent(
                        reference
                    ),
                    {
                        headers: {

                            Authorization:
                                `Bearer ${PAYSTACK_SECRET_KEY}`,

                            "Content-Type":
                                "application/json"

                        }

                    }
                );


            const paystackData =
                paystackResponse.data;


            if (
                !paystackData ||
                !paystackData.status ||
                !paystackData.data
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Invalid response from Paystack."

                });

            }


            const transaction =
                paystackData.data;


            /*
            |--------------------------------------------------------------------------
            | CHECK TRANSACTION STATUS
            |--------------------------------------------------------------------------
            */

            if (
                transaction.status !==
                "success"
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Paystack payment was not successful."

                });

            }


            /*
            |--------------------------------------------------------------------------
            | CHECK AMOUNT
            |--------------------------------------------------------------------------
            */

            const expectedAmount =
                Math.round(
                    Number(
                        payment.amount
                    ) * 100
                );


            const paidAmount =
                Number(
                    transaction.amount
                );


            if (
                paidAmount !==
                expectedAmount
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Payment amount does not match."

                });

            }


            /*
            |--------------------------------------------------------------------------
            | CHECK METADATA
            |--------------------------------------------------------------------------
            */

            const metadata =
                transaction.metadata || {};


            const paymentType =
                String(
                    metadata.payment_type ||
                    ""
                ).trim();


            if (
                paymentType !==
                "registration"
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "This payment is not a registration payment."

                });

            }


            /*
            |--------------------------------------------------------------------------
            | DATABASE TRANSACTION
            |--------------------------------------------------------------------------
            */

            connection =
                await pool.getConnection();


            await connection.beginTransaction();


            /*
            |--------------------------------------------------------------------------
            | LOCK PAYMENT
            |--------------------------------------------------------------------------
            */

            const [lockedPayments] =
                await connection.execute(
                    `
                    SELECT
                        id,
                        user_id,
                        amount,
                        reference,
                        status
                    FROM payments
                    WHERE id = ?
                    LIMIT 1
                    FOR UPDATE
                    `,
                    [
                        payment.id
                    ]
                );


            if (!lockedPayments.length) {

                await connection.rollback();

                return res.status(404).json({

                    success: false,

                    message:
                        "Payment record was not found."

                });

            }


            const lockedPayment =
                lockedPayments[0];


            /*
            |--------------------------------------------------------------------------
            | CHECK AGAIN
            |--------------------------------------------------------------------------
            */

            if (
                lockedPayment.status ===
                "success"
            ) {

                await connection.commit();

                return res.json({

                    success: true,

                    message:
                        "Registration payment was already verified.",

                    reference,

                    amount:
                        Number(
                            lockedPayment.amount
                        ),

                    user_id:
                        lockedPayment.user_id

                });

            }


            /*
            |--------------------------------------------------------------------------
            | MARK PAYMENT SUCCESS
            |--------------------------------------------------------------------------
            */

            await connection.execute(
                `
                UPDATE payments
                SET status = 'success'
                WHERE id = ?
                `,
                [
                    lockedPayment.id
                ]
            );


            /*
            |--------------------------------------------------------------------------
            | COMMIT
            |--------------------------------------------------------------------------
            */

            await connection.commit();


            /*
            |--------------------------------------------------------------------------
            | ACTIVATE USER
            |--------------------------------------------------------------------------
            */

            let activationResult = null;


            try {

                activationResult =
                    await activateUser(
                        lockedPayment.user_id
                    );

            } catch (activationError) {

                console.error(
                    "USER ACTIVATION ERROR:",
                    activationError
                );


                return res.status(500).json({

                    success: false,

                    message:
                        "Payment was successful, but account activation failed. Please contact support."

                });

            }


            /*
            |--------------------------------------------------------------------------
            | SUCCESS
            |--------------------------------------------------------------------------
            */

            console.log(
                "REGISTRATION PAYMENT SUCCESS:",
                {
                    userId:
                        lockedPayment.user_id,

                    amount:
                        lockedPayment.amount,

                    reference
                }
            );


            return res.json({

                success: true,

                message:
                    "Payment verified successfully. Your registration is now complete.",

                reference,

                amount:
                    Number(
                        lockedPayment.amount
                    ),

                user_id:
                    lockedPayment.user_id,

                account:
                    activationResult?.account ||
                    activationResult ||
                    null

            });


        } catch (error) {

            if (connection) {

                try {

                    await connection.rollback();

                } catch (rollbackError) {

                    console.error(
                        "ROLLBACK ERROR:",
                        rollbackError
                    );

                }

            }


            console.error(
                "REGISTRATION PAYSTACK VERIFY ERROR:",
                error.response?.data ||
                error.message ||
                error
            );


            return res.status(500).json({

                success: false,

                message:
                    error.response?.data?.message ||
                    error.message ||
                    "Registration payment verification failed."

            });

        } finally {

            if (connection) {
                connection.release();
            }

        }

    }
);


/*
|--------------------------------------------------------------------------
| VERIFY ADD-ACCOUNT PAYSTACK PAYMENT
|--------------------------------------------------------------------------
|
| GET /api/payments/accounts/add/verify/:reference
|
| NO JWT REQUIRED
|
| This is for an already logged-in user who paid ₦5,000
| through Paystack to create another virtual account.
|
|--------------------------------------------------------------------------
*/

router.get(
    "/accounts/add/verify/:reference",
    async (req, res) => {

        const reference =
            String(
                req.params.reference || ""
            ).trim();


        if (!reference) {

            return res.status(400).json({

                success: false,

                message:
                    "Payment reference is required."

            });

        }


        let connection;


        try {

            /*
            |--------------------------------------------------------------------------
            | FIND PAYMENT
            |--------------------------------------------------------------------------
            */

            const [payments] =
                await pool.execute(
                    `
                    SELECT
                        id,
                        user_id,
                        amount,
                        reference,
                        status
                    FROM payments
                    WHERE reference = ?
                    AND method = 'paystack'
                    AND reference LIKE 'ADD_%'
                    LIMIT 1
                    `,
                    [
                        reference
                    ]
                );


            if (!payments.length) {

                return res.status(404).json({

                    success: false,

                    message:
                        "Account creation payment was not found."

                });

            }


            const payment =
                payments[0];


            /*
            |--------------------------------------------------------------------------
            | VERIFY PAYSTACK
            |--------------------------------------------------------------------------
            */

            const paystackResponse =
                await axios.get(
                    "https://api.paystack.co/transaction/verify/" +
                    encodeURIComponent(
                        reference
                    ),
                    {
                        headers: {

                            Authorization:
                                `Bearer ${PAYSTACK_SECRET_KEY}`,

                            "Content-Type":
                                "application/json"

                        }

                    }
                );


            const paystackResponseData =
                paystackResponse.data;


            if (
                !paystackResponseData ||
                !paystackResponseData.status ||
                !paystackResponseData.data
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Invalid response from Paystack."

                });

            }


            const transaction =
                paystackResponseData.data;


            /*
            |--------------------------------------------------------------------------
            | STATUS
            |--------------------------------------------------------------------------
            */

            if (
                transaction.status !==
                "success"
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Paystack payment was not successful."

                });

            }


            /*
            |--------------------------------------------------------------------------
            | AMOUNT
            |--------------------------------------------------------------------------
            */

            const expectedAmount =
                Math.round(
                    Number(
                        payment.amount
                    ) * 100
                );


            const paidAmount =
                Number(
                    transaction.amount
                );


            if (
                paidAmount !==
                expectedAmount
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Payment amount does not match."

                });

            }


            /*
            |--------------------------------------------------------------------------
            | METADATA
            |--------------------------------------------------------------------------
            */

            const metadata =
                transaction.metadata || {};


            const accountno =
                String(
                    metadata.accountno ||
                    ""
                ).trim();


            const paymentType =
                String(
                    metadata.payment_type ||
                    ""
                ).trim();


            if (
                paymentType !==
                "account_creation"
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "This payment is not an account creation payment."

                });

            }


            if (!accountno) {

                return res.status(400).json({

                    success: false,

                    message:
                        "The selected virtual account number was not found in the Paystack payment."

                });

            }


            /*
            |--------------------------------------------------------------------------
            | DATABASE TRANSACTION
            |--------------------------------------------------------------------------
            */

            connection =
                await pool.getConnection();


            await connection.beginTransaction();


            /*
            |--------------------------------------------------------------------------
            | LOCK PAYMENT
            |--------------------------------------------------------------------------
            */

            const [lockedPayments] =
                await connection.execute(
                    `
                    SELECT
                        id,
                        user_id,
                        amount,
                        reference,
                        status
                    FROM payments
                    WHERE id = ?
                    LIMIT 1
                    FOR UPDATE
                    `,
                    [
                        payment.id
                    ]
                );


            if (!lockedPayments.length) {

                await connection.rollback();

                return res.status(404).json({

                    success: false,

                    message:
                        "Payment record no longer exists."

                });

            }


            const lockedPayment =
                lockedPayments[0];


            /*
            |--------------------------------------------------------------------------
            | ALREADY PROCESSED
            |--------------------------------------------------------------------------
            */

            if (
                lockedPayment.status ===
                "success"
            ) {

                await connection.commit();

                return res.json({

                    success: true,

                    message:
                        "Account creation payment was already processed.",

                    reference,

                    amount:
                        Number(
                            lockedPayment.amount
                        )

                });

            }


            /*
            |--------------------------------------------------------------------------
            | LOCK SOURCE ACCOUNT
            |--------------------------------------------------------------------------
            */

            const [accounts] =
                await connection.execute(
                    `
                    SELECT
                        id,
                        user_id,
                        accountno,
                        account_name,
                        status,
                        balance
                    FROM virtual_account
                    WHERE user_id = ?
                    AND accountno = ?
                    LIMIT 1
                    FOR UPDATE
                    `,
                    [
                        lockedPayment.user_id,
                        accountno
                    ]
                );


            /*
            |--------------------------------------------------------------------------
            | IMPORTANT ACCOUNT CHECK
            |--------------------------------------------------------------------------
            */

            if (!accounts.length) {

                await connection.rollback();

                console.error(
                    "SELECTED ACCOUNT NOT FOUND:",
                    {
                        userId:
                            lockedPayment.user_id,

                        accountno,

                        reference
                    }
                );


                return res.status(404).json({

                    success: false,

                    message:
                        `Selected virtual account ${accountno} was not found for this member.`

                });

            }


            const sourceAccount =
                accounts[0];


            /*
            |--------------------------------------------------------------------------
            | STATUS
            |--------------------------------------------------------------------------
            */

            if (
                sourceAccount.status !==
                "active"
            ) {

                await connection.rollback();

                return res.status(400).json({

                    success: false,

                    message:
                        "Selected virtual account is inactive."

                });

            }


            /*
            |--------------------------------------------------------------------------
            | BALANCE
            |--------------------------------------------------------------------------
            */

            const currentBalance =
                Number(
                    sourceAccount.balance || 0
                );


            const fee =
                Number(
                    lockedPayment.amount
                );


            if (
                currentBalance <
                fee
            ) {

                await connection.rollback();

                return res.status(400).json({

                    success: false,

                    message:
                        `Insufficient balance in account ${sourceAccount.accountno}. Available balance: ₦${currentBalance.toLocaleString("en-NG", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2
                        })}`

                });

            }


            /*
            |--------------------------------------------------------------------------
            | DEDUCT
            |--------------------------------------------------------------------------
            */

            const [deductionResult] =
                await connection.execute(
                    `
                    UPDATE virtual_account
                    SET balance = balance - ?
                    WHERE id = ?
                    AND user_id = ?
                    AND accountno = ?
                    AND balance >= ?
                    `,
                    [
                        fee,

                        sourceAccount.id,

                        lockedPayment.user_id,

                        sourceAccount.accountno,

                        fee
                    ]
                );


            if (
                deductionResult.affectedRows !== 1
            ) {

                throw new Error(
                    "The account creation fee could not be deducted."
                );

            }


            const newBalance =
                currentBalance -
                fee;


            /*
            |--------------------------------------------------------------------------
            | GENERATE NEW ACCOUNT NUMBER
            |--------------------------------------------------------------------------
            */

            const year =
                new Date()
                    .getFullYear()
                    .toString();


            let newAccountNo = null;


            for (
                let attempt = 0;
                attempt < 50;
                attempt++
            ) {

                const randomPart =
                    crypto.randomInt(
                        10000,
                        100000
                    );


                const candidate =
                    "2" +
                    randomPart +
                    year;


                const [existing] =
                    await connection.execute(
                        `
                        SELECT id
                        FROM virtual_account
                        WHERE accountno = ?
                        LIMIT 1
                        `,
                        [
                            candidate
                        ]
                    );


                if (!existing.length) {

                    newAccountNo =
                        candidate;

                    break;

                }

            }


            if (!newAccountNo) {

                throw new Error(
                    "Unable to generate a unique virtual account number."
                );

            }


            /*
            |--------------------------------------------------------------------------
            | CREATE ACCOUNT
            |--------------------------------------------------------------------------
            */

            const [newAccount] =
                await connection.execute(
                    `
                    INSERT INTO virtual_account
                    (
                        user_id,
                        accountno,
                        account_name,
                        status,
                        balance
                    )
                    VALUES
                    (
                        ?,
                        ?,
                        ?,
                        'active',
                        0
                    )
                    `,
                    [
                        lockedPayment.user_id,

                        newAccountNo,

                        sourceAccount.account_name
                    ]
                );


            /*
            |--------------------------------------------------------------------------
            | MARK PAYMENT SUCCESS
            |--------------------------------------------------------------------------
            */

            await connection.execute(
                `
                UPDATE payments
                SET status = 'success'
                WHERE id = ?
                `,
                [
                    lockedPayment.id
                ]
            );


            /*
            |--------------------------------------------------------------------------
            | COMMIT
            |--------------------------------------------------------------------------
            */

            await connection.commit();


            console.log(
                "ACCOUNT CREATION SUCCESS:",
                {
                    userId:
                        lockedPayment.user_id,

                    sourceAccount:
                        sourceAccount.accountno,

                    deducted:
                        fee,

                    remainingBalance:
                        newBalance,

                    newAccount:
                        newAccountNo,

                    reference
                }
            );


            return res.json({

                success: true,

                message:
                    "Payment verified successfully. ₦5,000 was deducted and your new virtual account was created.",

                reference,

                amount:
                    fee,

                source_accountno:
                    sourceAccount.accountno,

                source_account_balance:
                    newBalance,

                account: {

                    id:
                        newAccount.insertId,

                    accountno:
                        newAccountNo,

                    account_name:
                        sourceAccount.account_name,

                    status:
                        "active",

                    balance:
                        0

                }

            });


        } catch (error) {

            if (connection) {

                try {
                    await connection.rollback();
                } catch (rollbackError) {

                    console.error(
                        "ROLLBACK ERROR:",
                        rollbackError
                    );

                }

            }


            console.error(
                "ADD ACCOUNT PAYSTACK VERIFY ERROR:",
                error.response?.data ||
                error.message ||
                error
            );


            return res.status(500).json({

                success: false,

                message:
                    error.response?.data?.message ||
                    error.message ||
                    "Account creation payment verification failed."

            });

        } finally {

            if (connection) {
                connection.release();
            }

        }

    }
);


/*
|--------------------------------------------------------------------------
| VERIFY VIRTUAL ACCOUNT FUNDING
|--------------------------------------------------------------------------
|
| GET /api/payments/fund/verify/:reference
|
| NO JWT REQUIRED
|
|--------------------------------------------------------------------------
*/

/*
|--------------------------------------------------------------------------
| VERIFY VIRTUAL ACCOUNT FUNDING
|--------------------------------------------------------------------------
|
| GET /api/payments/fund/verify/:reference
|
| NO JWT REQUIRED
|
| SUCCESS FLOW:
|
| 1. Find payment
| 2. Verify with Paystack
| 3. Confirm wallet_funding
| 4. Confirm user
| 5. Confirm amount
| 6. Start DB transaction
| 7. Lock payment
| 8. Lock wallet transaction
| 9. Lock virtual account
| 10. Prevent duplicate credit
| 11. Credit virtual account
| 12. Set payments.status = success
| 13. Set wallet_transactions.status = success
| 14. Commit
|
|--------------------------------------------------------------------------
*/

router.get(
    "/fund/verify/:reference",
    async (req, res) => {

        const reference =
            String(
                req.params.reference || ""
            ).trim();


        /*
        |--------------------------------------------------------------------------
        | VALIDATE REFERENCE
        |--------------------------------------------------------------------------
        */

        if (!reference) {

            return res.status(400).json({

                success: false,

                message:
                    "Payment reference is required."

            });

        }


        /*
        |--------------------------------------------------------------------------
        | DATABASE CONNECTION
        |--------------------------------------------------------------------------
        */

        let connection = null;


        try {

            /*
            |--------------------------------------------------------------------------
            | FIND PAYMENT
            |--------------------------------------------------------------------------
            */

            const [payments] =
                await pool.execute(
                    `
                    SELECT
                        id,
                        user_id,
                        amount,
                        reference,
                        status
                    FROM payments
                    WHERE reference = ?
                    AND method = 'paystack'
                    AND reference LIKE 'FUND_%'
                    LIMIT 1
                    `,
                    [
                        reference
                    ]
                );


            /*
            |--------------------------------------------------------------------------
            | PAYMENT NOT FOUND
            |--------------------------------------------------------------------------
            */

            if (!payments.length) {

                return res.status(404).json({

                    success: false,

                    message:
                        "Funding payment record was not found.",

                    reference

                });

            }


            const payment =
                payments[0];


            /*
            |--------------------------------------------------------------------------
            | VERIFY WITH PAYSTACK
            |--------------------------------------------------------------------------
            */

            let paystackResponse;


            try {

                paystackResponse =
                    await axios.get(
                        "https://api.paystack.co/transaction/verify/" +
                        encodeURIComponent(reference),
                        {
                            headers: {

                                Authorization:
                                    `Bearer ${PAYSTACK_SECRET_KEY}`,

                                "Content-Type":
                                    "application/json"

                            }

                        }
                    );

            } catch (paystackError) {

                console.error(
                    "PAYSTACK VERIFY ERROR:",
                    paystackError.response?.data ||
                    paystackError.message
                );


                return res.status(502).json({

                    success: false,

                    message:
                        paystackError.response?.data?.message ||
                        "Unable to verify payment with Paystack.",

                    reference

                });

            }


            /*
            |--------------------------------------------------------------------------
            | PAYSTACK RESPONSE
            |--------------------------------------------------------------------------
            */

            const paystackData =
                paystackResponse.data;


            if (
                !paystackData ||
                !paystackData.status ||
                !paystackData.data
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Invalid response from Paystack.",

                    reference

                });

            }


            const transaction =
                paystackData.data;


            /*
            |--------------------------------------------------------------------------
            | VERIFY REFERENCE
            |--------------------------------------------------------------------------
            */

            if (
                String(
                    transaction.reference || ""
                ).trim() !== reference
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Paystack reference does not match the payment record.",

                    reference

                });

            }


            /*
            |--------------------------------------------------------------------------
            | PAYSTACK STATUS
            |--------------------------------------------------------------------------
            */

            const paystackStatus =
                String(
                    transaction.status || ""
                ).toLowerCase()
                .trim();


            /*
            |--------------------------------------------------------------------------
            | PAYMENT NOT SUCCESSFUL
            |--------------------------------------------------------------------------
            */

            if (
                paystackStatus !== "success"
            ) {

                /*
                |--------------------------------------------------------------------------
                | UPDATE FAILED PAYMENT
                |--------------------------------------------------------------------------
                */

                if (
                    [
                        "failed",
                        "abandoned",
                        "reversed"
                    ].includes(
                        paystackStatus
                    )
                ) {

                    await pool.execute(
                        `
                        UPDATE payments
                        SET
                            status = 'failed',
                            updated_at = NOW()
                        WHERE id = ?
                        LIMIT 1
                        `,
                        [
                            payment.id
                        ]
                    );


                    await pool.execute(
                        `
                        UPDATE wallet_transactions
                        SET
                            payment_method = 'paystack',
                            status = 'failed'
                        WHERE reference = ?
                        AND user_id = ?
                        LIMIT 1
                        `,
                        [
                            reference,
                            payment.user_id
                        ]
                    );

                }


                return res.status(400).json({

                    success: false,

                    message:
                        "Paystack payment was not successful.",

                    reference,

                    paystack_status:
                        transaction.status

                });

            }


            /*
            |--------------------------------------------------------------------------
            | VERIFY AMOUNT
            |--------------------------------------------------------------------------
            */

            const expectedAmount =
                Math.round(
                    Number(
                        payment.amount
                    ) * 100
                );


            const paidAmount =
                Number(
                    transaction.amount
                );


            if (
                paidAmount !==
                expectedAmount
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Payment amount does not match.",

                    reference,

                    expected_amount:
                        Number(
                            payment.amount
                        ),

                    paid_amount:
                        paidAmount / 100

                });

            }


            /*
            |--------------------------------------------------------------------------
            | PAYSTACK METADATA
            |--------------------------------------------------------------------------
            */

            const metadata =
                transaction.metadata || {};


            /*
            |--------------------------------------------------------------------------
            | VERIFY PAYMENT TYPE
            |--------------------------------------------------------------------------
            */

            const paymentType =
                String(
                    metadata.payment_type || ""
                ).trim();


            if (
                paymentType !==
                "wallet_funding"
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "This Paystack payment is not a wallet funding payment.",

                    reference

                });

            }


            /*
            |--------------------------------------------------------------------------
            | GET ACCOUNT NUMBER
            |--------------------------------------------------------------------------
            */

            const accountno =
                String(
                    metadata.accountno || ""
                ).trim();


            if (!accountno) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Virtual account number was not found in the payment.",

                    reference

                });

            }


            /*
            |--------------------------------------------------------------------------
            | VERIFY USER
            |--------------------------------------------------------------------------
            */

            const metadataUserId =
                Number(
                    metadata.user_id
                );


            if (
                metadataUserId !==
                Number(
                    payment.user_id
                )
            ) {

                return res.status(403).json({

                    success: false,

                    message:
                        "Payment user verification failed.",

                    reference

                });

            }


            /*
            |--------------------------------------------------------------------------
            | GET DATABASE CONNECTION
            |--------------------------------------------------------------------------
            |
            | IMPORTANT:
            |
            | connection MUST be created before using
            | connection.execute().
            |
            |--------------------------------------------------------------------------
            */

            connection =
                await pool.getConnection();


            if (!connection) {

                throw new Error(
                    "Unable to obtain database connection."
                );

            }


            /*
            |--------------------------------------------------------------------------
            | START TRANSACTION
            |--------------------------------------------------------------------------
            */

            await connection.beginTransaction();


            /*
            |--------------------------------------------------------------------------
            | LOCK PAYMENT
            |--------------------------------------------------------------------------
            */

            const [lockedPayments] =
                await connection.execute(
                    `
                    SELECT
                        id,
                        user_id,
                        amount,
                        reference,
                        status
                    FROM payments
                    WHERE id = ?
                    LIMIT 1
                    FOR UPDATE
                    `,
                    [
                        payment.id
                    ]
                );


            if (!lockedPayments.length) {

                throw new Error(
                    "Payment record could not be found."
                );

            }


            const lockedPayment =
                lockedPayments[0];


            /*
            |--------------------------------------------------------------------------
            | VERIFY PAYMENT REFERENCE AGAIN
            |--------------------------------------------------------------------------
            */

            if (
                String(
                    lockedPayment.reference || ""
                ).trim() !== reference
            ) {

                throw new Error(
                    "Locked payment reference does not match."
                );

            }


            /*
            |--------------------------------------------------------------------------
            | FIND AND LOCK WALLET TRANSACTION
            |--------------------------------------------------------------------------
            |
            | THIS IS WHERE walletTransaction IS CREATED.
            |
            |--------------------------------------------------------------------------
            */

            const [walletTransactions] =
                await connection.execute(
                    `
                    SELECT
                        id,
                        user_id,
                        accountno,
                        amount,
                        reference,
                        payment_method,
                        status
                    FROM wallet_transactions
                    WHERE reference = ?
                    AND user_id = ?
                    LIMIT 1
                    FOR UPDATE
                    `,
                    [
                        reference,
                        lockedPayment.user_id
                    ]
                );


            /*
            |--------------------------------------------------------------------------
            | WALLET TRANSACTION MUST EXIST
            |--------------------------------------------------------------------------
            */

            if (!walletTransactions.length) {

                throw new Error(
                    "Wallet transaction record was not found for this payment."
                );

            }


            /*
            |--------------------------------------------------------------------------
            | CREATE walletTransaction VARIABLE
            |--------------------------------------------------------------------------
            |
            | DO NOT REMOVE THIS.
            |
            |--------------------------------------------------------------------------
            */

            const walletTransaction =
                walletTransactions[0];


            /*
            |--------------------------------------------------------------------------
            | VERIFY WALLET TRANSACTION ACCOUNT
            |--------------------------------------------------------------------------
            */

            if (
                String(
                    walletTransaction.accountno || ""
                ).trim() !== accountno
            ) {

                throw new Error(
                    "Wallet transaction account number does not match the Paystack payment."
                );

            }


            /*
            |--------------------------------------------------------------------------
            | VERIFY WALLET TRANSACTION USER
            |--------------------------------------------------------------------------
            */

            if (
                Number(
                    walletTransaction.user_id
                ) !==
                Number(
                    lockedPayment.user_id
                )
            ) {

                throw new Error(
                    "Wallet transaction user does not match the payment user."
                );

            }


            /*
            |--------------------------------------------------------------------------
            | VERIFY WALLET TRANSACTION AMOUNT
            |--------------------------------------------------------------------------
            */

            if (
                Number(
                    walletTransaction.amount
                ) !==
                Number(
                    lockedPayment.amount
                )
            ) {

                throw new Error(
                    "Wallet transaction amount does not match the payment amount."
                );

            }


            /*
            |--------------------------------------------------------------------------
            | LOCK VIRTUAL ACCOUNT
            |--------------------------------------------------------------------------
            */

            const [accounts] =
                await connection.execute(
                    `
                    SELECT
                        id,
                        user_id,
                        accountno,
                        account_name,
                        status,
                        balance
                    FROM virtual_account
                    WHERE user_id = ?
                    AND accountno = ?
                    LIMIT 1
                    FOR UPDATE
                    `,
                    [
                        lockedPayment.user_id,
                        accountno
                    ]
                );


            /*
            |--------------------------------------------------------------------------
            | ACCOUNT NOT FOUND
            |--------------------------------------------------------------------------
            */

            if (!accounts.length) {

                throw new Error(
                    `Virtual account ${accountno} was not found for this member.`
                );

            }


            const account =
                accounts[0];


            /*
            |--------------------------------------------------------------------------
            | ACCOUNT STATUS
            |--------------------------------------------------------------------------
            */

            if (
                String(
                    account.status || ""
                ).toLowerCase() !==
                "active"
            ) {

                throw new Error(
                    "Selected virtual account is inactive."
                );

            }


            /*
            |--------------------------------------------------------------------------
            | ALREADY SUCCESSFUL
            |--------------------------------------------------------------------------
            |
            | VERY IMPORTANT:
            |
            | If payments is already success, DO NOT credit
            | the virtual account again.
            |
            |--------------------------------------------------------------------------
            */

            if (
                String(
                    lockedPayment.status || ""
                ).toLowerCase() ===
                "success"
            ) {

                /*
                |--------------------------------------------------------------------------
                | ENSURE WALLET TRANSACTION IS SUCCESS
                |--------------------------------------------------------------------------
                */

                await connection.execute(
                    `
                    UPDATE wallet_transactions
                    SET
                        payment_method = 'paystack',
                        status = 'success'
                    WHERE id = ?
                    AND reference = ?
                    AND user_id = ?
                    LIMIT 1
                    `,
                    [
                        walletTransaction.id,
                        reference,
                        lockedPayment.user_id
                    ]
                );


                /*
                |--------------------------------------------------------------------------
                | COMMIT
                |--------------------------------------------------------------------------
                */

                await connection.commit();


                return res.json({

                    success: true,

                    message:
                        "Payment was already verified successfully.",

                    reference,

                    amount:
                        Number(
                            lockedPayment.amount
                        ),

                    accountno:
                        account.accountno,

                    account_name:
                        account.account_name,

                    balance:
                        Number(
                            account.balance
                        ),

                    payment_method:
                        "paystack",

                    status:
                        "success"

                });

            }


            /*
            |--------------------------------------------------------------------------
            | AMOUNT TO CREDIT
            |--------------------------------------------------------------------------
            */

            const amountNGN =
                Number(
                    lockedPayment.amount
                );


            /*
            |--------------------------------------------------------------------------
            | CREDIT VIRTUAL ACCOUNT
            |--------------------------------------------------------------------------
            */

            const [balanceUpdate] =
                await connection.execute(
                    `
                    UPDATE virtual_account
                    SET
                        balance = balance + ?
                    WHERE id = ?
                    AND user_id = ?
                    AND accountno = ?
                    `,
                    [
                        amountNGN,

                        account.id,

                        lockedPayment.user_id,

                        accountno
                    ]
                );


            if (
                balanceUpdate.affectedRows !== 1
            ) {

                throw new Error(
                    "Virtual account balance could not be updated."
                );

            }


            /*
            |--------------------------------------------------------------------------
            | UPDATE PAYMENTS STATUS
            |--------------------------------------------------------------------------
            */

            const [paymentUpdate] =
                await connection.execute(
                    `
                    UPDATE payments
                    SET
                        status = 'success',
                        updated_at = NOW()
                    WHERE id = ?
                    LIMIT 1
                    `,
                    [
                        lockedPayment.id
                    ]
                );


            if (
                paymentUpdate.affectedRows !== 1
            ) {

                throw new Error(
                    "Payment status could not be updated to success."
                );

            }


            /*
            |--------------------------------------------------------------------------
            | UPDATE WALLET TRANSACTION STATUS
            |--------------------------------------------------------------------------
            |
            | THIS IS THE IMPORTANT PART.
            |
            | walletTransaction was declared above.
            |
            |--------------------------------------------------------------------------
            */

            const [walletTransactionUpdate] =
                await connection.execute(
                    `
                    UPDATE wallet_transactions
                    SET
                        payment_method = 'paystack',
                        status = 'success'
                    WHERE id = ?
                    AND reference = ?
                    AND user_id = ?
                    LIMIT 1
                    `,
                    [
                        walletTransaction.id,
                        reference,
                        lockedPayment.user_id
                    ]
                );


            if (
                walletTransactionUpdate.affectedRows !== 1
            ) {

                throw new Error(
                    "Wallet transaction status could not be updated to success."
                );

            }


            /*
            |--------------------------------------------------------------------------
            | GET UPDATED BALANCE
            |--------------------------------------------------------------------------
            */

            const [updatedAccounts] =
                await connection.execute(
                    `
                    SELECT
                        accountno,
                        account_name,
                        balance
                    FROM virtual_account
                    WHERE id = ?
                    LIMIT 1
                    `,
                    [
                        account.id
                    ]
                );


            if (!updatedAccounts.length) {

                throw new Error(
                    "Unable to retrieve updated virtual account."
                );

            }


            const updatedAccount =
                updatedAccounts[0];


            /*
            |--------------------------------------------------------------------------
            | COMMIT EVERYTHING
            |--------------------------------------------------------------------------
            */

            await connection.commit();


            /*
            |--------------------------------------------------------------------------
            | SUCCESS LOG
            |--------------------------------------------------------------------------
            */

            console.log(
                "================================================="
            );

            console.log(
                "PAYSTACK WALLET FUND SUCCESS"
            );

            console.log(
                "User ID:",
                lockedPayment.user_id
            );

            console.log(
                "Account No:",
                updatedAccount.accountno
            );

            console.log(
                "Amount:",
                amountNGN
            );

            console.log(
                "Reference:",
                reference
            );

            console.log(
                "Payment Status:",
                "success"
            );

            console.log(
                "Wallet Transaction Status:",
                "success"
            );

            console.log(
                "New Balance:",
                Number(
                    updatedAccount.balance
                )
            );

            console.log(
                "================================================="
            );


            /*
            |--------------------------------------------------------------------------
            | SUCCESS RESPONSE
            |--------------------------------------------------------------------------
            */

            return res.json({

                success: true,

                message:
                    "Payment verified and virtual account credited successfully.",

                reference,

                amount:
                    amountNGN,

                accountno:
                    updatedAccount.accountno,

                account_name:
                    updatedAccount.account_name,

                balance:
                    Number(
                        updatedAccount.balance
                    ),

                payment_method:
                    "paystack",

                status:
                    "success"

            });


        } catch (error) {

            /*
            |--------------------------------------------------------------------------
            | ROLLBACK
            |--------------------------------------------------------------------------
            */

            if (connection) {

                try {

                    await connection.rollback();

                } catch (rollbackError) {

                    console.error(
                        "ROLLBACK ERROR:",
                        rollbackError
                    );

                }

            }


            /*
            |--------------------------------------------------------------------------
            | LOG ERROR
            |--------------------------------------------------------------------------
            */

            console.error(
                "================================================="
            );

            console.error(
                "FUND VERIFY ERROR:",
                error.message || error
            );

            console.error(
                "REFERENCE:",
                reference
            );

            console.error(
                "================================================="
            );


            /*
            |--------------------------------------------------------------------------
            | ERROR RESPONSE
            |--------------------------------------------------------------------------
            */

            return res.status(500).json({

                success: false,

                message:
                    error.message ||
                    "Payment verification failed.",

                reference

            });

        } finally {

            /*
            |--------------------------------------------------------------------------
            | RELEASE CONNECTION
            |--------------------------------------------------------------------------
            */

            if (connection) {

                connection.release();

            }

        }

    }
);







/* ============================================================
   GET WALLET TRANSACTIONS
   GET /api/payments/wallet-transactions
============================================================ */

router.get(
    "/wallet-transactions",
    authenticate,
    async (req, res) => {

        try {

            const userId = Number(req.user.id);

            if (!Number.isInteger(userId) || userId <= 0) {
                return res.status(401).json({
                    success: false,
                    message: "Invalid authenticated user."
                });
            }

            const [transactions] = await pool.query(
                `
                SELECT
                    id,
                    user_id,
                    reference,
                    amount,
                    payment_method,
                    status,
                    paystack_status,
                    transaction_id,
                    paid_at,
                    created_at
                FROM wallet_transactions
                WHERE user_id = ?
                ORDER BY id DESC
                `,
                [userId]
            );

            return res.json({
                success: true,
                transactions
            });

        } catch (error) {

            console.error(
                "GET WALLET TRANSACTIONS ERROR:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Unable to load wallet transactions."
            });
        }
    }
);


/* ============================================================
   GET PAYMENT HISTORY
   GET /api/payments/history

   Reads from:
   payments
============================================================ */

router.get(
    "/history",
    authenticate,
    async (req, res) => {

        try {

            const userId = Number(req.user.id);

            if (!Number.isInteger(userId) || userId <= 0) {
                return res.status(401).json({
                    success: false,
                    message: "Invalid authenticated user."
                });
            }

            const [payments] = await pool.query(
                `
                SELECT
                    id,
                    user_id,
                    method,
                    payment_type,
                    payment_method,
                    amount,
                    reference,
                    status,
                    gateway_response,
                    virtual_account_id,
                    approved_by,
                    updated_at,
                    approved_at,
                    created_at
                FROM payments
                WHERE user_id = ?
                ORDER BY id DESC
                `,
                [userId]
            );

            return res.json({
                success: true,
                payments
            });

        } catch (error) {

            console.error(
                "GET PAYMENT HISTORY ERROR:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Unable to load payment records."
            });
        }
    }
);





/* =========================================================
   GET LOGGED-IN USER VIRTUAL ACCOUNT PAYMENTS
   GET /api/payments/virtual-transactions

   JWT REQUIRED

   VIRTUAL ACCOUNT RULE:
   - Reference MUST start with VACC
   - Payment belongs to logged-in user
   - payment_type = online
   - payment_method = virtual
========================================================= */

router.get(
    "/virtual-transactions",
    authenticate,
    async (req, res) => {

        try {

            /* =================================================
               GET USER ID FROM JWT
            ================================================= */

            const userId = Number(
                req.user?.id ??
                req.user?.user_id
            );

            if (
                !Number.isInteger(userId) ||
                userId <= 0
            ) {

                return res.status(401).json({
                    success: false,
                    message:
                        "Invalid or expired login session."
                });

            }


            /* =================================================
               GET LOGGED-IN USER
            ================================================= */

            const [users] =
                await pool.query(
                    `
                    SELECT
                        id,
                        full_name,
                        email,
                        phone_number,
                        gender,
                        payment_status,
                        account_status
                    FROM users
                    WHERE id = ?
                    LIMIT 1
                    `,
                    [userId]
                );


            if (!users.length) {

                return res.status(404).json({
                    success: false,
                    message:
                        "User account not found."
                });

            }


            const user = users[0];


            /* =================================================
               GET USER VIRTUAL ACCOUNTS
            ================================================= */

            const [accounts] =
                await pool.query(
                    `
                    SELECT
                        id,
                        accountno,
                        account_name,
                        status,
                        balance,
                        created_at
                    FROM virtual_account
                    WHERE user_id = ?
                    ORDER BY id ASC
                    `,
                    [userId]
                );


            /* =================================================
               GET ONLY VIRTUAL ACCOUNT TRANSACTIONS

               VIRTUAL ACCOUNT REFERENCE:
                   VACC...

               SECURITY:
                   p.user_id MUST MATCH JWT USER ID

               LEFT JOIN:
                   Allows transaction to appear even when
                   virtual_account_id is NULL.

               payment_type:
                   online

               payment_method:
                   virtual
            ================================================= */

            const [payments] =
                await pool.query(
                    `
                    SELECT
                        p.id,

                        p.user_id,

                        p.virtual_account_id,

                        p.reference,

                        p.amount,

                        p.status,

                        p.method,

                        'online' AS payment_type,

                        'virtual' AS payment_method,

                        p.gateway_response,

                        p.created_at,

                        p.updated_at,

                        va.accountno,

                        va.account_name

                    FROM payments p

                    LEFT JOIN virtual_account va
                        ON va.id = p.virtual_account_id
                        AND va.user_id = p.user_id

                    WHERE
                        p.user_id = ?
                        AND UPPER(p.reference) LIKE 'VACC%'

                    ORDER BY
                        p.created_at DESC,
                        p.id DESC
                    `,
                    [userId]
                );


            /* =================================================
               RESPONSE
            ================================================= */

            return res.json({

                success: true,

                user: {

                    id:
                        user.id,

                    full_name:
                        user.full_name,

                    email:
                        user.email,

                    phone_number:
                        user.phone_number,

                    gender:
                        user.gender,

                    payment_status:
                        user.payment_status,

                    account_status:
                        user.account_status
                },

                accounts,

                payments,

                total:
                    payments.length
            });


        } catch (error) {

            console.error(
                "VIRTUAL TRANSACTIONS ERROR:",
                error
            );


            return res.status(500).json({

                success: false,

                message:
                    "Unable to load virtual account transactions.",

                error:
                    error.message
            });

        }

    }
);










/*
|--------------------------------------------------------------------------
| EXPORT ROUTER
|--------------------------------------------------------------------------
*/

module.exports = router;