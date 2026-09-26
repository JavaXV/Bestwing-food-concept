
/*
|--------------------------------------------------------------------------
| WALLET.JS
|--------------------------------------------------------------------------
*/


const express = require("express");
const axios = require("axios");
const crypto = require("crypto");

const pool = require("../config/db");
const { authenticate } = require("../middleware/auth");

require("dotenv").config();

const router = express.Router();

/*
|--------------------------------------------------------------------------
| CONFIGURATION
|--------------------------------------------------------------------------
*/

const PAYSTACK_SECRET_KEY =
    process.env.PAYSTACK_SECRET_KEY ||
    process.env.PAYSTACK_SECRET;

const MINIMUM_FUNDING_AMOUNT = 100;


/*
|--------------------------------------------------------------------------
| HELPER: GET AUTHENTICATED USER ID
|--------------------------------------------------------------------------
*/

function getUserId(req) {

    return (
        req.auth?.id ||
        req.auth?.user_id ||
        req.auth?.userId
    );

}


/*
|--------------------------------------------------------------------------
| GET USER VIRTUAL ACCOUNTS
|--------------------------------------------------------------------------
|
| GET /api/wallet/accounts
|
*/

router.get(
    "/accounts",
    authenticate,
    async (req, res) => {

        try {

            const userId = getUserId(req);

            if (!userId) {

                return res.status(401).json({
                    success: false,
                    message: "User authentication failed."
                });

            }

            const [accounts] = await pool.query(
                `
                SELECT
                    id,
                    user_id,
                    accountno,
                    account_name,
                    status,
                    COALESCE(balance, 0) AS balance,
                    created_at
                FROM virtual_account
                WHERE user_id = ?
                ORDER BY id ASC
                `,
                [userId]
            );

            return res.json({
                success: true,
                accounts
            });

        } catch (error) {

            console.error(
                "GET WALLET ACCOUNTS ERROR:",
                error
            );

            return res.status(500).json({
                success: false,
                message: "Unable to load virtual accounts."
            });

        }

    }
);


/*
|--------------------------------------------------------------------------
| GET SELECTED VIRTUAL ACCOUNT BALANCE
|--------------------------------------------------------------------------
|
| GET /api/wallet/balance/:accountno
|
*/

router.get(
    "/balance/:accountno",
    authenticate,
    async (req, res) => {

        try {

            const userId = getUserId();
            const accountNo = req.params.accountno;

            if (!userId) {

                return res.status(401).json({
                    success: false,
                    message: "User authentication failed."
                });

            }

            if (!accountNo) {

                return res.status(400).json({
                    success: false,
                    message: "Account number is required."
                });

            }

            const [accounts] = await pool.query(
                `
                SELECT
                    id,
                    user_id,
                    accountno,
                    account_name,
                    status,
                    COALESCE(balance, 0) AS balance
                FROM virtual_account
                WHERE user_id = ?
                AND accountno = ?
                LIMIT 1
                `,
                [
                    userId,
                    accountNo
                ]
            );

            if (!accounts.length) {

                return res.status(404).json({
                    success: false,
                    message: "Virtual account not found."
                });

            }

            const account = accounts[0];

            return res.json({
                success: true,
                account
            });

        } catch (error) {

            console.error(
                "GET WALLET BALANCE ERROR:",
                error
            );

            return res.status(500).json({
                success: false,
                message: "Unable to load account balance."
            });

        }

    }
);




/* ============================================================
   MANUAL BANK WALLET FUNDING
   ============================================================

   POST /api/wallet/manual

   JWT REQUIRED

   FLOW:

   1. Get user_id from JWT
   2. Validate amount
   3. Validate virtual account
   4. Confirm virtual account belongs to logged-in user
   5. Create one unique VACC reference
   6. Insert into payments
   7. Insert into wallet_transactions
   8. Insert into account_payments
   9. Commit transaction

   IMPORTANT:

   - Balance is NOT increased here.
   - Balance is increased only after approval/verification.
   - All three tables use the SAME reference.
   - payment_type = online
   - payment_method = virtual
   - status = pending initially
============================================================ */

router.post(
    "/manual",
    authenticate,
    async (req, res) => {

        let connection;

        try {

            /* =================================================
               GET LOGGED-IN USER
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
               GET REQUEST DATA
            ================================================= */

            const {
                amount,
                accountno
            } = req.body;


            /* =================================================
               VALIDATE AMOUNT
            ================================================= */

            const numericAmount =
                Number(amount);


            if (
                !Number.isFinite(numericAmount) ||
                numericAmount < 100
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Minimum wallet funding amount is ₦100."

                });

            }


            /* =================================================
               ROUND AMOUNT
            ================================================= */

            const finalAmount =
                Math.round(
                    numericAmount * 100
                ) / 100;


            /* =================================================
               VALIDATE ACCOUNT NUMBER
            ================================================= */

            if (
                !accountno ||
                typeof accountno !== "string"
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Please select a virtual account."

                });

            }


            const cleanAccountNo =
                accountno.trim();


            if (!cleanAccountNo) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Please select a valid virtual account."

                });

            }


            /* =================================================
               GET DATABASE CONNECTION
            ================================================= */

            connection =
                await pool.getConnection();


            /* =================================================
               START DATABASE TRANSACTION
            ================================================= */

            await connection.beginTransaction();


            /* =================================================
               FIND USER'S VIRTUAL ACCOUNT
            =================================================

               SECURITY:

               user_id + accountno must match.

               This prevents a user from funding another
               user's virtual account.
            ================================================= */

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
                    WHERE
                        user_id = ?
                        AND accountno = ?
                    LIMIT 1
                    `,
                    [
                        userId,
                        cleanAccountNo
                    ]
                );


            /* =================================================
               ACCOUNT NOT FOUND
            ================================================= */

            if (!accounts.length) {

                await connection.rollback();

                return res.status(404).json({

                    success: false,

                    message:
                        "Selected virtual account was not found."

                });

            }


            const account =
                accounts[0];


            /* =================================================
               ACCOUNT MUST BE ACTIVE
            ================================================= */

            if (
                String(account.status || "")
                    .toLowerCase() !== "active"
            ) {

                await connection.rollback();

                return res.status(400).json({

                    success: false,

                    message:
                        "The selected virtual account is inactive."

                });

            }


            /* =================================================
               CREATE UNIQUE VIRTUAL ACCOUNT REFERENCE
            =================================================

               Example:

               VACC-1757612345678-30
            ================================================= */

            const reference =
                "VACC-" +
                Date.now() +
                "-" +
                userId;


            /* =================================================
               INSERT INTO PAYMENTS
            =================================================

               IMPORTANT:

               payment_type   = online
               payment_method = virtual
               status         = pending
            ================================================= */

            const [paymentResult] =
                await connection.execute(
                    `
                    INSERT INTO payments
                    (
                        user_id,
                        method,
                        payment_type,
                        payment_method,
                        amount,
                        reference,
                        status,
                        gateway_response,
                        virtual_account_id
                    )
                    VALUES
                    (
                        ?,
                        ?,
                        ?,
                        ?,
                        ?,
                        ?,
                        ?,
                        ?,
                        ?
                    )
                    `,
                    [
                        userId,

                        "manual",

                        "WALLET_FUND",

                        "BANK_TRANSFER",

                        finalAmount,

                        reference,

                        "pending",

                        null,

                        account.id
                    ]
                );


            const paymentId =
                paymentResult.insertId;


            /* =================================================
               INSERT INTO WALLET_TRANSACTIONS
            ================================================= */

            const [walletResult] =
                await connection.execute(
                    `
                    INSERT INTO wallet_transactions
                    (
                        user_id,
                        accountno,
                        email,
                        amount,
                        payment_method,
                        virtual_account_id,
                        status,
                        reference,
                        description,
                        paystack_status,
                        transaction_id,
                        paid_at
                    )
                    SELECT
                        ?,
                        ?,
                        u.email,
                        ?,
                        ?,
                        ?,
                        ?,
                        ?,
                        ?,
                        ?,
                        ?,
                        ?
                    FROM users u
                    WHERE u.id = ?
                    LIMIT 1
                    `,
                    [
                        userId,

                        account.accountno,

                        finalAmount,

                        "BANK_TRANSFER",

                        account.id,

                        "pending",

                        reference,

                        "Virtual account wallet funding",

                        "pending",

                        null,

                        null,

                        userId
                    ]
                );


            /* =================================================
               INSERT INTO ACCOUNT_PAYMENTS
            ================================================= */

            const metadata =
                JSON.stringify({
                    source: "manual_wallet_funding",
                    payment_id: paymentId,
                    accountno: account.accountno,
                    payment_type: "WALLET_FUND",
                    payment_method: "VIRTUAL_PAYMENT"
                });


            await connection.execute(
                `
                INSERT INTO account_payments
                (
                    user_id,
                    virtual_account_id,
                    amount,
                    payment_method,
                    reference,
                    status,
                    account_id,
                    metadata,
                    transaction_id,
                    paystack_status,
                    paid_at
                )
                VALUES
                (
                    ?,
                    ?,
                    ?,
                    ?,
                    ?,
                    ?,
                    ?,
                    ?,
                    ?,
                    ?,
                    ?
                )
                `,
                [
                    userId,

                    account.id,

                    finalAmount,

                    "manual",

                    reference,

                    "pending",

                    account.id,

                    metadata,

                    null,

                    "pending",

                    null
                ]
            );


            /* =================================================
               COMMIT
            ================================================= */

            await connection.commit();


            /* =================================================
               SUCCESS RESPONSE
            ================================================= */

            return res.status(201).json({

                success: true,

                message:
                    "Virtual account funding submitted successfully. Awaiting payment confirmation.",

                payment_id:
                    paymentId,

                reference:
                    reference,

                user_id:
                    userId,

                virtual_account_id:
                    account.id,

                accountno:
                    account.accountno,

                account_name:
                    account.account_name,

                amount:
                    finalAmount,

                payment_type:
                    "online",

                payment_method:
                    "virtual",

                status:
                    "pending"

            });


        } catch (error) {

            /* =================================================
               ROLLBACK
            ================================================= */

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
                "MANUAL VIRTUAL ACCOUNT FUNDING ERROR:",
                error
            );


            return res.status(500).json({

                success: false,

                message:
                    "Unable to submit virtual account funding.",

                error:
                    process.env.NODE_ENV === "production"
                        ? undefined
                        : error.message

            });


        } finally {

            /* =================================================
               RELEASE CONNECTION
            ================================================= */

            if (connection) {

                connection.release();

            }

        }

    }
);






/*
|--------------------------------------------------------------------------
| INITIALIZE PAYSTACK WALLET FUNDING
|--------------------------------------------------------------------------
|
| POST /api/wallet/paystack/initialize
|
| Body:
| {
|     amount: 10000,
|     accountno: "1234567890"
| }
|
*/

router.post(
    "/paystack/initialize",
    authenticate,
    async (req, res) => {

        try {

            const userId = getUserId();

            if (!userId) {

                return res.status(401).json({
                    success: false,
                    message: "User authentication failed."
                });

            }

            const amount =
                Number(req.body.amount);

            const accountNo =
                String(
                    req.body.accountno || ""
                ).trim();

            if (
                !Number.isFinite(amount) ||
                amount < MINIMUM_FUNDING_AMOUNT
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        `Minimum funding amount is ₦${MINIMUM_FUNDING_AMOUNT.toLocaleString()}.`
                });

            }

            if (!accountNo) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Please select a virtual account."
                });

            }

            /*
            |--------------------------------------------------------------------------
            | VERIFY ACCOUNT BELONGS TO LOGGED-IN USER
            |--------------------------------------------------------------------------
            */

            const [accounts] = await pool.query(
                `
                SELECT
                    id,
                    user_id,
                    accountno,
                    account_name,
                    status,
                    COALESCE(balance, 0) AS balance
                FROM virtual_account
                WHERE user_id = ?
                AND accountno = ?
                AND status = 'active'
                LIMIT 1
                `,
                [
                    userId,
                    accountNo
                ]
            );

            if (!accounts.length) {

                return res.status(404).json({
                    success: false,
                    message:
                        "The selected virtual account was not found or is inactive."
                });

            }

            /*
            |--------------------------------------------------------------------------
            | GET USER EMAIL
            |--------------------------------------------------------------------------
            */

            const [users] = await pool.query(
                `
                SELECT
                    id,
                    email,
                    full_name
                FROM users
                WHERE id = ?
                LIMIT 1
                `,
                [userId]
            );

            if (!users.length) {

                return res.status(404).json({
                    success: false,
                    message: "User account not found."
                });

            }

            const user = users[0];

            const email =
                user.email ||
                `${userId}@bestwing.com.ng`;

            /*
            |--------------------------------------------------------------------------
            | GENERATE UNIQUE REFERENCE
            |--------------------------------------------------------------------------
            */

            const reference =
                `WALLET_${userId}_${Date.now()}_${crypto
                    .randomBytes(4)
                    .toString("hex")}`;

            /*
            |--------------------------------------------------------------------------
            | SAVE PENDING TRANSACTION
            |--------------------------------------------------------------------------
            */

            /*
            | Make sure wallet_transactions has:
            |
            | accountno CHAR(10)
            |
            */

            await pool.query(
                `
                INSERT INTO wallet_transactions
                (
                    user_id,
                    accountno,
                    amount,
                    reference,
                    status
                )
                VALUES (?, ?, ?, ?, 'pending')
                `,
                [
                    userId,
                    accountNo,
                    amount,
                    reference
                ]
            );

            /*
            |--------------------------------------------------------------------------
            | INITIALIZE PAYSTACK
            |--------------------------------------------------------------------------
            */

            if (!PAYSTACK_SECRET_KEY) {

                return res.status(500).json({
                    success: false,
                    message:
                        "PAYSTACK_SECRET_KEY is not configured."
                });

            }

            const paystackResponse =
                await axios.post(
                    "https://api.paystack.co/transaction/initialize",
                    {
                        email,
                        amount:
                            Math.round(amount * 100),

                        reference,

                        callback_url:
                            process.env.PAYSTACK_CALLBACK_URL ||
                            `${process.env.BASE_URL || "https://bestwing.com.ng"}/payment/verify.html`,

                        metadata: {

                            user_id: userId,

                            accountno:
                                accountNo,

                            account_name:
                                accounts[0].account_name,

                            purpose:
                                "Virtual Account Funding"

                        }

                    },
                    {
                        headers: {

                            Authorization:
                                `Bearer ${PAYSTACK_SECRET_KEY}`,

                            "Content-Type":
                                "application/json"

                        },

                        timeout: 30000

                    }
                );

            if (
                !paystackResponse.data ||
                !paystackResponse.data.status
            ) {

                return res.status(500).json({
                    success: false,
                    message:
                        "Paystack could not initialize the payment."
                });

            }

            const payment =
                paystackResponse.data.data;

            return res.json({

                success: true,

                message:
                    "Payment initialized successfully.",

                reference,

                authorization_url:
                    payment.authorization_url,

                access_code:
                    payment.access_code,

                accountno:
                    accountNo,

                amount

            });

        } catch (error) {

            console.error(
                "PAYSTACK WALLET INITIALIZE ERROR:",
                error.response?.data ||
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    error.response?.data?.message ||
                    "Unable to initialize wallet funding."
            });

        }

    }
);


/*
|--------------------------------------------------------------------------
| VERIFY PAYSTACK WALLET FUNDING
|--------------------------------------------------------------------------
|
| GET /api/wallet/paystack/verify/:reference
|
|--------------------------------------------------------------------------
| IMPORTANT
|--------------------------------------------------------------------------
| The money is credited to virtual_account.balance.
| users.balance is NOT updated.
|
*/

router.get(
    "/paystack/verify/:reference",
    authenticate,
    async (req, res) => {

        const connection =
            await pool.getConnection();

        try {

            const userId =
                getUserId(req);

            const reference =
                String(
                    req.params.reference || ""
                ).trim();

            if (!userId) {

                return res.status(401).json({
                    success: false,
                    message:
                        "User authentication failed."
                });

            }

            if (!reference) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Payment reference is required."
                });

            }

            if (!PAYSTACK_SECRET_KEY) {

                return res.status(500).json({
                    success: false,
                    message:
                        "PAYSTACK_SECRET_KEY is not configured."
                });

            }

            /*
            |--------------------------------------------------------------------------
            | VERIFY PAYMENT WITH PAYSTACK
            |--------------------------------------------------------------------------
            */

            const paystackResponse =
                await axios.get(
                    `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
                    {
                        headers: {

                            Authorization:
                                `Bearer ${PAYSTACK_SECRET_KEY}`

                        },

                        timeout: 30000

                    }
                );

            const payment =
                paystackResponse.data?.data;

            if (!payment) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Paystack payment information was not found."
                });

            }

            /*
            |--------------------------------------------------------------------------
            | PAYMENT MUST BE SUCCESSFUL
            |--------------------------------------------------------------------------
            */

            if (payment.status !== "success") {

                return res.status(400).json({
                    success: false,
                    message:
                        "Payment has not been completed.",
                    status:
                        payment.status
                });

            }

            /*
            |--------------------------------------------------------------------------
            | FIND OUR PAYMENT RECORD
            |--------------------------------------------------------------------------
            */

            const [transactions] =
                await connection.query(
                    `
                    SELECT
                        id,
                        user_id,
                        accountno,
                        amount,
                        reference,
                        status
                    FROM wallet_transactions
                    WHERE reference = ?
                    LIMIT 1
                    `,
                    [reference]
                );

            if (!transactions.length) {

                return res.status(404).json({
                    success: false,
                    message:
                        "Wallet transaction record was not found."
                });

            }

            const walletTransaction =
                transactions[0];

            /*
            |--------------------------------------------------------------------------
            | SECURITY CHECK
            |--------------------------------------------------------------------------
            */

            if (
                Number(walletTransaction.user_id) !==
                Number(userId)
            ) {

                return res.status(403).json({
                    success: false,
                    message:
                        "This payment does not belong to your account."
                });

            }

            /*
            |--------------------------------------------------------------------------
            | COMPARE AMOUNTS
            |--------------------------------------------------------------------------
            */

            const expectedAmount =
                Math.round(
                    Number(walletTransaction.amount) *
                    100
                );

            const paidAmount =
                Number(payment.amount);

            if (
                expectedAmount !==
                paidAmount
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Payment amount does not match the wallet transaction."
                });

            }

            /*
            |--------------------------------------------------------------------------
            | START DATABASE TRANSACTION
            |--------------------------------------------------------------------------
            */

            await connection.beginTransaction();

            /*
            |--------------------------------------------------------------------------
            | LOCK WALLET TRANSACTION
            |--------------------------------------------------------------------------
            */

            const [lockedTransactions] =
                await connection.query(
                    `
                    SELECT
                        id,
                        user_id,
                        accountno,
                        amount,
                        reference,
                        status
                    FROM wallet_transactions
                    WHERE id = ?
                    FOR UPDATE
                    `,
                    [walletTransaction.id]
                );

            if (!lockedTransactions.length) {

                await connection.rollback();

                return res.status(404).json({
                    success: false,
                    message:
                        "Wallet transaction could not be locked."
                });

            }

            const lockedTransaction =
                lockedTransactions[0];

            /*
            |--------------------------------------------------------------------------
            | PREVENT DOUBLE CREDIT
            |--------------------------------------------------------------------------
            */

            if (
                lockedTransaction.status ===
                "successful"
            ) {

                await connection.commit();

                /*
                | Return the current account balance.
                */

                const [existingAccount] =
                    await connection.query(
                        `
                        SELECT
                            accountno,
                            account_name,
                            COALESCE(balance, 0) AS balance,
                            status
                        FROM virtual_account
                        WHERE user_id = ?
                        AND accountno = ?
                        LIMIT 1
                        `,
                        [
                            lockedTransaction.user_id,
                            lockedTransaction.accountno
                        ]
                    );

                return res.json({
                    success: true,
                    message:
                        "Payment has already been processed.",
                    already_processed: true,
                    account:
                        existingAccount[0] || null
                });

            }

            /*
            |--------------------------------------------------------------------------
            | LOCK THE EXACT VIRTUAL ACCOUNT
            |--------------------------------------------------------------------------
            */

            const [accounts] =
                await connection.query(
                    `
                    SELECT
                        id,
                        user_id,
                        accountno,
                        account_name,
                        status,
                        COALESCE(balance, 0) AS balance
                    FROM virtual_account
                    WHERE user_id = ?
                    AND accountno = ?
                    AND status = 'active'
                    LIMIT 1
                    FOR UPDATE
                    `,
                    [
                        lockedTransaction.user_id,
                        lockedTransaction.accountno
                    ]
                );

            if (!accounts.length) {

                await connection.rollback();

                return res.status(404).json({
                    success: false,
                    message:
                        "The virtual account for this payment was not found."
                });

            }

            const virtualAccount =
                accounts[0];

            /*
            |--------------------------------------------------------------------------
            | CREDIT SELECTED VIRTUAL ACCOUNT
            |--------------------------------------------------------------------------
            */

            await connection.query(
                `
                UPDATE virtual_account
                SET balance =
                    COALESCE(balance, 0) + ?
                WHERE id = ?
                `,
                [
                    Number(
                        lockedTransaction.amount
                    ),

                    virtualAccount.id
                ]
            );

            /*
            |--------------------------------------------------------------------------
            | MARK PAYMENT SUCCESSFUL
            |--------------------------------------------------------------------------
            */

            await connection.query(
                `
                UPDATE wallet_transactions
                SET
                    status = 'successful',
                    paystack_status = ?,
                    transaction_id = ?,
                    paid_at = NOW()
                WHERE id = ?
                `,
                [
                    payment.status,
                    payment.id,
                    lockedTransaction.id
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
            | GET NEW BALANCE
            |--------------------------------------------------------------------------
            */

            const [updatedAccounts] =
                await connection.query(
                    `
                    SELECT
                        id,
                        accountno,
                        account_name,
                        status,
                        COALESCE(balance, 0) AS balance
                    FROM virtual_account
                    WHERE id = ?
                    LIMIT 1
                    `,
                    [virtualAccount.id]
                );

            const updatedAccount =
                updatedAccounts[0];

            return res.json({

                success: true,

                message:
                    "Payment verified and wallet funded successfully.",

                reference,

                amount:
                    Number(
                        lockedTransaction.amount
                    ),

                account:
                    updatedAccount

            });

        } catch (error) {

            try {

                await connection.rollback();

            } catch (_) {}

            console.error(
                "PAYSTACK WALLET VERIFY ERROR:",
                error.response?.data ||
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    error.response?.data?.message ||
                    "Unable to verify wallet payment."
            });

        } finally {

            connection.release();

        }

    }
);


  /*
            |--------------------------------------------------------------------------
            | GET WALLET  TRANSACTIONS
            |--------------------------------------------------------------------------
            */
router.get(
    "/wallet-transactions",
    authenticate,
    async (req, res) => {

        try {

            /*
            |--------------------------------------------------------------------------
            | GET LOGGED-IN USER ID FROM JWT
            |--------------------------------------------------------------------------
            */

            const userId =
                Number(
                    req.user?.id ||
                    req.user?.user_id
                );


            if (!userId) {

                return res.status(401).json({

                    success: false,

                    message:
                        "Unable to identify logged-in user."

                });

            }


            /*
            |--------------------------------------------------------------------------
            | GET ONLY THIS USER'S WALLET TRANSACTIONS
            |--------------------------------------------------------------------------
            */

            const [transactions] =
                await pool.execute(
                    `
                    SELECT
                        id,
                        user_id,
                        accountno,
                        amount,
                        reference,
						paystack_status,
                        payment_method,
                        status,
                        created_at
                    FROM wallet_transactions
                    WHERE user_id = ?
                    ORDER BY id DESC
                    `,
                    [
                        userId
                    ]
                );


            /*
            |--------------------------------------------------------------------------
            | RESPONSE
            |--------------------------------------------------------------------------
            */

            return res.json({

                success: true,

                user_id:
                    userId,

                transactions

            });


        } catch (error) {

            console.error(
                "WALLET TRANSACTIONS ERROR:",
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

/*
|--------------------------------------------------------------------------
| EXPORT ROUTER
|--------------------------------------------------------------------------
*/

module.exports = router;


