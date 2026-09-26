/*
|--------------------------------------------------------------------------
| AUTH ROUTER
|--------------------------------------------------------------------------
*/

const express = require("express");

const bcrypt = require("bcryptjs");

const jwt = require("jsonwebtoken");

const crypto = require("crypto");

const axios = require("axios");

const pool = require("../config/db");

const { authenticate } =
    require("../middleware/auth");

require("dotenv").config();

const router = express.Router();


/*
|--------------------------------------------------------------------------
| CONSTANTS
|--------------------------------------------------------------------------
*/

const ADD_ACCOUNT_FEE = 3000;


/*
|--------------------------------------------------------------------------
| PUBLIC USER
|--------------------------------------------------------------------------
*/

function publicUser(u, account) {

    return {

        id:
            u.id,

        full_name:
            u.full_name,

        email:
            u.email,

        phone_number:
            u.phone_number,

        gender:
            u.gender,

        referral:
            u.referral,

        payment_status:
            u.payment_status,

        account_status:
            u.account_status,

        account_number:
            account?.accountno || null,

        account_name:
            account?.account_name || null,

        created_at:
            u.created_at

    };

}


/*
|--------------------------------------------------------------------------
| USER REGISTRATION
|--------------------------------------------------------------------------
| POST /api/auth/register
|
| PUBLIC ROUTE
|
| NO JWT
| NO AUTHORIZATION
| NO authenticate middleware
|--------------------------------------------------------------------------
*/

router.post(
    "/register",
    async (req, res) => {

        try {

            const {
                full_name,
                email,
                phone_number,
                gender,
                referral,
                password
            } = req.body;


            /*
            |--------------------------------------------------------------------------
            | VALIDATE REQUIRED FIELDS
            |--------------------------------------------------------------------------
            */

            if (
                !full_name ||
                !email ||
                !phone_number ||
                !gender ||
                !password
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Full name, email, phone number, gender and password are required"

                });

            }


            /*
            |--------------------------------------------------------------------------
            | PASSWORD LENGTH
            |--------------------------------------------------------------------------
            */

            if (
                password.length < 6
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Password must be at least 6 characters"

                });

            }


            /*
            |--------------------------------------------------------------------------
            | CHECK DUPLICATE EMAIL / PHONE
            |--------------------------------------------------------------------------
            */

            const [duplicate] =
                await pool.query(
                    `
                    SELECT id
                    FROM users
                    WHERE email = ?
                    OR phone_number = ?
                    LIMIT 1
                    `,
                    [
                        email.trim(),
                        phone_number.trim()
                    ]
                );


            if (
                duplicate.length
            ) {

                return res.status(409).json({

                    success: false,

                    message:
                        "Email or phone number already registered"

                });

            }


            /*
            |--------------------------------------------------------------------------
            | HASH PASSWORD
            |--------------------------------------------------------------------------
            */

            const passwordHash =
                await bcrypt.hash(
                    password,
                    12
                );


            /*
            |--------------------------------------------------------------------------
            | CREATE USER
            |--------------------------------------------------------------------------
            */

            const [result] =
                await pool.query(
                    `
                    INSERT INTO users
                    (
                        full_name,
                        email,
                        phone_number,
                        gender,
                        referral,
                        password_hash
                    )
                    VALUES
                    (
                        ?,
                        ?,
                        ?,
                        ?,
                        ?,
                        ?
                    )
                    `,
                    [
                        full_name.trim(),
                        email.trim(),
                        phone_number.trim(),
                        gender,
                        referral || null,
                        passwordHash
                    ]
                );


            /*
            |--------------------------------------------------------------------------
            | SUCCESS
            |--------------------------------------------------------------------------
            */

            return res.status(201).json({

                success: true,

                message:
                    "Registration successful. Choose a payment method.",

                user_id:
                    result.insertId,

                payment_required:
                    ADD_ACCOUNT_FEE

            });


        } catch (error) {

            console.error(
                "REGISTRATION ERROR:",
                error
            );


            return res.status(500).json({

                success: false,

                message:
                    error.message

            });

        }

    }
);


/*
|--------------------------------------------------------------------------
| USER LOGIN
|--------------------------------------------------------------------------
| POST /api/auth/login
|
| PUBLIC ROUTE
|
| JWT IS CREATED HERE.
|--------------------------------------------------------------------------
*/

router.post(
    "/login",
    async (req, res) => {

        try {

            const {
                phone_number,
                password
            } = req.body;


            /*
            |--------------------------------------------------------------------------
            | VALIDATE
            |--------------------------------------------------------------------------
            */

            if (
                !phone_number ||
                !password
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Phone number and password are required"

                });

            }


            /*
            |--------------------------------------------------------------------------
            | FIND USER
            |--------------------------------------------------------------------------
            */

            const [rows] =
                await pool.query(
                    `
                    SELECT *
                    FROM users
                    WHERE phone_number = ?
                    LIMIT 1
                    `,
                    [
                        phone_number.trim()
                    ]
                );


            /*
            |--------------------------------------------------------------------------
            | USER NOT FOUND
            |--------------------------------------------------------------------------
            */

            if (
                !rows.length
            ) {

                return res.status(401).json({

                    success: false,

                    message:
                        "Invalid phone number or password"

                });

            }


            const user =
                rows[0];


            /*
            |--------------------------------------------------------------------------
            | CHECK PASSWORD
            |--------------------------------------------------------------------------
            */

            const passwordMatch =
                await bcrypt.compare(
                    password,
                    user.password_hash
                );


            /*
            |--------------------------------------------------------------------------
            | PASSWORD INVALID
            |--------------------------------------------------------------------------
            */

            // if (
            //     !passwordMatch
            // ) {

            //     return res.status(401).json({

            //         success: false,

            //         message:
            //             "Invalid phone number or password"

            //     });

            // }



            /*
            |--------------------------------------------------------------------------
            | CHECK PAYMENT STATUS
            |--------------------------------------------------------------------------
            |
            | Users whose payment_status is "unpaid"
            | are NOT allowed to log in.
            |
            */

			if (
			    String(user.payment_status || "")
			        .trim()
			        .toLowerCase() === "unpaid"
			) {
			
			    return res.status(403).json({
			
			        success: false,
			
			        payment_required: true,
			
			        payment_status:
			            user.payment_status,
			
			        message:
			            "Your registration payment is unpaid. Please complete your ₦5,000 registration payment before logging in.",
			
			        payment_url:
			            "/payment.html",
			
			        payment_link: `
				    <a
				        href="/payment.html"
				        style="
				            display: inline-block;
				            padding: 14px 25px;
				            background-color: #0d6efd;
				            color: white;
				            text-decoration: none;
				            border-radius: 6px;
				            font-weight: bold;
				            font-size: 16px;
				            cursor: pointer;
				        "
				    >
				        Pay ₦5,000 Now
				    </a>
				`
			
			    });
			
			}


            /*
            |--------------------------------------------------------------------------
            | GET FIRST VIRTUAL ACCOUNT
            |--------------------------------------------------------------------------
            */

            const [accounts] =
                await pool.query(
                    `
                    SELECT
                        id,
                        user_id,
                        accountno,
                        account_name,
                        balance,
                        status,
                        created_at
                    FROM virtual_account
                    WHERE user_id = ?
                    ORDER BY id ASC
                    LIMIT 1
                    `,
                    [
                        user.id
                    ]
                );


            /*
            |--------------------------------------------------------------------------
            | CREATE JWT
            |--------------------------------------------------------------------------
            |
            | JWT IS ONLY CREATED AFTER SUCCESSFUL LOGIN.
            |
            */

            const token =
                jwt.sign(
                    {
                        id:
                            user.id,

                        phone_number:
                            user.phone_number,

                        isAdmin:
                            false
                    },
                    process.env.JWT_SECRET,
                    {
                        expiresIn:
                            "7d"
                    }
                );


            /*
            |--------------------------------------------------------------------------
            | LOGIN SUCCESS
            |--------------------------------------------------------------------------
            */

            return res.json({

                success: true,

                message:
                    "Login successful",

                token:
                    token,

                user:
                    publicUser(
                        user,
                        accounts[0]
                    )

            });


        } catch (error) {

            console.error(
                "LOGIN ERROR:",
                error
            );


            return res.status(500).json({

                success: false,

                message:
                    error.message

            });

        }

    }
);


/*
|--------------------------------------------------------------------------
| GET LOGGED-IN USER
|--------------------------------------------------------------------------
| GET /api/auth/me
|
| PROTECTED
| JWT REQUIRED
|
| JWT IS VERIFIED BY middleware/auth.js
|--------------------------------------------------------------------------
*/

router.get(
    "/me",
    authenticate,
    async (req, res) => {

        try {

            const userId =
                req.user.id;


            /*
            |--------------------------------------------------------------------------
            | GET USER
            |--------------------------------------------------------------------------
            */

            const [users] =
                await pool.query(
                    `
                    SELECT *
                    FROM users
                    WHERE id = ?
                    LIMIT 1
                    `,
                    [
                        userId
                    ]
                );


            if (
                !users.length
            ) {

                return res.status(404).json({

                    success: false,

                    message:
                        "User not found"

                });

            }


            const user =
                users[0];


            /*
            |--------------------------------------------------------------------------
            | GET FIRST ACCOUNT
            |--------------------------------------------------------------------------
            */

            const [accounts] =
                await pool.query(
                    `
                    SELECT
                        id,
                        user_id,
                        accountno,
                        account_name,
                        balance,
                        status,
                        created_at
                    FROM virtual_account
                    WHERE user_id = ?
                    ORDER BY id ASC
                    LIMIT 1
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

                user:
                    publicUser(
                        user,
                        accounts[0]
                    )

            });


        } catch (error) {

            console.error(
                "GET ME ERROR:",
                error
            );


            return res.status(500).json({

                success: false,

                message:
                    error.message

            });

        }

    }
);


/*
|--------------------------------------------------------------------------
| GET ALL USER ACCOUNTS
|--------------------------------------------------------------------------
| GET /api/auth/accounts
|
| PROTECTED
| JWT REQUIRED
|--------------------------------------------------------------------------
*/

router.get(
    "/accounts",
    authenticate,
    async (req, res) => {

        try {

            const userId =
                req.user.id;


            /*
            |--------------------------------------------------------------------------
            | GET ALL ACCOUNTS
            |--------------------------------------------------------------------------
            */

            const [accounts] =
                await pool.query(
                    `
                    SELECT
                        va.id,
                        va.user_id,
                        va.accountno,
                        va.account_name,
                        va.balance,
                        va.status,
                        va.created_at
                    FROM virtual_account va
                    WHERE va.user_id = ?
                    ORDER BY va.id ASC
					LIMIT 1
                    `,
                    [
                        userId
                    ]
                );


            /*
            |--------------------------------------------------------------------------
            | FORMAT
            |--------------------------------------------------------------------------
            */

            const formattedAccounts =
                accounts.map(
                    account => {

                        return {

                            id:
                                account.id,

                            user_id:
                                account.user_id,

                            accountno:
                                account.accountno,

                            account_name:
                                account.account_name,

                            balance:
                                Number(
                                    account.balance || 0
                                ),

                            status:
                                account.status,

                            created_at:
                                account.created_at

                        };

                    }
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

                accounts:
                    formattedAccounts

            });


        } catch (error) {

            console.error(
                "GET USER ACCOUNTS ERROR:",
                error
            );


            return res.status(500).json({

                success: false,

                message:
                    error.message

            });

        }

    }
);


/*
|--------------------------------------------------------------------------
| GET ACCOUNT BY ACCOUNT NAME
|--------------------------------------------------------------------------
| GET /api/auth/account/:accountName
|
| PROTECTED
|--------------------------------------------------------------------------
*/

router.get(
    "/account/:accountName",
    authenticate,
    async (req, res) => {

        try {

            const userId =
                req.user.id;

            const accountName =
                req.params.accountName;


            const [accounts] =
                await pool.query(
                    `
                    SELECT
                        id,
                        user_id,
                        accountno,
                        account_name,
                        balance,
                        status,
                        created_at
                    FROM virtual_account
                    WHERE user_id = ?
                    AND account_name = ?
                    LIMIT 1
                    `,
                    [
                        userId,
                        accountName
                    ]
                );


            if (
                !accounts.length
            ) {

                return res.status(404).json({

                    success: false,

                    message:
                        "Account not found"

                });

            }


            const account =
                accounts[0];


            return res.json({

                success: true,

                account: {

                    id:
                        account.id,

                    user_id:
                        account.user_id,

                    accountno:
                        account.accountno,

                    account_name:
                        account.account_name,

                    balance:
                        Number(
                            account.balance || 0
                        ),

                    status:
                        account.status,

                    created_at:
                        account.created_at

                }

            });


        } catch (error) {

            console.error(
                "GET ACCOUNT BY NAME ERROR:",
                error
            );


            return res.status(500).json({

                success: false,

                message:
                    error.message

            });

        }

    }
);


/*
|--------------------------------------------------------------------------
| GET SELECTED ACCOUNT
|--------------------------------------------------------------------------
| GET /api/auth/accounts/:accountNo
|
| PROTECTED
| JWT REQUIRED
|--------------------------------------------------------------------------
*/

router.get(
    "/accounts/:accountNo",
    authenticate,
    async (req, res) => {

        try {

            const userId =
                req.user.id;

            const accountNo =
                req.params.accountNo;


            const [accounts] =
                await pool.query(
                    `
                    SELECT
                        id,
                        user_id,
                        accountno,
                        account_name,
                        balance,
                        status,
                        created_at
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


            if (
                !accounts.length
            ) {

                return res.status(404).json({

                    success: false,

                    message:
                        "Account not found or does not belong to this user"

                });

            }


            const account =
                accounts[0];


            return res.json({

                success: true,

                account: {

                    id:
                        account.id,

                    user_id:
                        account.user_id,

                    accountno:
                        account.accountno,

                    account_name:
                        account.account_name,

                    balance:
                        Number(
                            account.balance || 0
                        ),

                    status:
                        account.status,

                    created_at:
                        account.created_at

                },

                unique_account_id:
                    `${userId}-${account.accountno}`

            });


        } catch (error) {

            console.error(
                "GET SELECTED ACCOUNT ERROR:",
                error
            );


            return res.status(500).json({

                success: false,

                message:
                    error.message

            });

        }

    }
);


/*
|--------------------------------------------------------------------------
| ADMIN LOGIN
|--------------------------------------------------------------------------
| POST /api/auth/admin/login
|
| PUBLIC ROUTE
|
| JWT CREATED AFTER SUCCESSFUL ADMIN LOGIN.
|--------------------------------------------------------------------------
*/

router.post(
    "/admin/login",
    async (req, res) => {

        try {

            const {
                phone_number,
                password
            } = req.body;


            if (
                !phone_number ||
                !password
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Phone number and password are required"

                });

            }


            const [rows] =
                await pool.query(
                    `
                    SELECT *
                    FROM admin_users
                    WHERE phone_number = ?
                    LIMIT 1
                    `,
                    [
                        phone_number.trim()
                    ]
                );


            if (
                !rows.length
            ) {

                return res.status(401).json({

                    success: false,

                    message:
                        "Invalid admin credentials"

                });

            }


            const passwordMatch =
                await bcrypt.compare(
                    password,
                    rows[0].password_hash
                );


            if (
                !passwordMatch
            ) {

                return res.status(401).json({

                    success: false,

                    message:
                        "Invalid admin credentials"

                });

            }


            /*
            |--------------------------------------------------------------------------
            | CREATE ADMIN JWT
            |--------------------------------------------------------------------------
            */

            const token =
                jwt.sign(
                    {
                        id:
                            rows[0].id,

                        phone_number:
                            rows[0].phone_number,

                        isAdmin:
                            true
                    },
                    process.env.JWT_SECRET,
                    {
                        expiresIn:
                            "8h"
                    }
                );


            return res.json({

                success: true,

                message:
                    "Admin login successful",

                token:
                    token

            });


        } catch (error) {

            console.error(
                "ADMIN LOGIN ERROR:",
                error
            );


            return res.status(500).json({

                success: false,

                message:
                    "Admin login failed"

            });

        }

    }
);


/*
|--------------------------------------------------------------------------
| GENERATE UNIQUE ACCOUNT NUMBER
|--------------------------------------------------------------------------
*/

async function generateUniqueAccountNumber(
    connection
) {

    let accountNo;

    let exists = true;


    while (
        exists
    ) {

        /*
        --------------------------------------------------------------
        | 6 RANDOM DIGITS + 4 DIGIT YEAR = 10 DIGITS
        --------------------------------------------------------------
        */

        const randomPart =
            crypto.randomInt(
                100000,
                999999
            );


        const year =
            new Date()
                .getFullYear();


        accountNo =
            String(randomPart) +
            String(year);


        const [rows] =
            await connection.query(
                `
                SELECT id
                FROM virtual_account
                WHERE accountno = ?
                LIMIT 1
                `,
                [
                    accountNo
                ]
            );


        exists =
            rows.length > 0;

    }


    return accountNo;

}


/*
|--------------------------------------------------------------------------
| ADDITIONAL ACCOUNT
|--------------------------------------------------------------------------
| POST /api/auth/accounts/add
|
| PROTECTED
|
| The selected virtual account pays ₦5,000.
|--------------------------------------------------------------------------
*/

router.post(
    "/accounts/add",
    authenticate,
    async (req, res) => {

        const connection =
            await pool.getConnection();

        try {

            const userId =
                req.user.id;

            const {
                accountno
            } = req.body;

            const ACCOUNT_CREATION_FEE = 5000;


            if (!accountno) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Please select a virtual account."
                });

            }


            await connection.beginTransaction();


            /*
            |--------------------------------------------------------------------------
            | LOCK THE SELECTED ACCOUNT
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
                        balance,
                        status
                    FROM virtual_account
                    WHERE user_id = ?
                    AND accountno = ?
                    AND status = 'active'
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
                        "Selected virtual account was not found."
                });

            }


            const sourceAccount =
                accounts[0];


            const balance =
                Number(sourceAccount.balance);


            console.log(
                "ADD ACCOUNT PAYMENT:",
                {
                    userId,
                    sourceAccountNo:
                        sourceAccount.accountno,
                    balance
                }
            );


            /*
            |--------------------------------------------------------------------------
            | CHECK BALANCE
            |--------------------------------------------------------------------------
            */

            if (
                balance <
                ACCOUNT_CREATION_FEE
            ) {

                await connection.rollback();

                return res.status(400).json({
                    success: false,
                    message:
                        `Insufficient balance in account ${sourceAccount.accountno}. ` +
                        `Available balance: ₦${balance.toFixed(2)}`
                });

            }


            /*
            |--------------------------------------------------------------------------
            | GENERATE NEW ACCOUNT NUMBER
            |--------------------------------------------------------------------------
            |
            | Replace this with your existing account-number generator.
            |
            |--------------------------------------------------------------------------
            */

            let newAccountNo;

            while (true) {

                newAccountNo =
                    String(
                        Math.floor(
                            1000000000 +
                            Math.random() *
                            9000000000
                        )
                    );

                const [existing] =
                    await connection.query(
                        `
                        SELECT id
                        FROM virtual_account
                        WHERE accountno = ?
                        LIMIT 1
                        `,
                        [newAccountNo]
                    );

                if (!existing.length) {
                    break;
                }

            }


            /*
            |--------------------------------------------------------------------------
            | GET USER NAME
            |--------------------------------------------------------------------------
            */

            const [users] =
                await connection.query(
                    `
                    SELECT
                        id,
                        full_name
                    FROM users
                    WHERE id = ?
                    LIMIT 1
                    `,
                    [userId]
                );


            if (!users.length) {

                await connection.rollback();

                return res.status(404).json({
                    success: false,
                    message:
                        "User not found."
                });

            }


            const accountName =
                users[0].full_name;


            /*
            |--------------------------------------------------------------------------
            | DEDUCT ₦5,000 FROM SELECTED ACCOUNT
            |--------------------------------------------------------------------------
            */

            await connection.query(
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
                    sourceAccount.accountno,
                    ACCOUNT_CREATION_FEE
                ]
            );


            /*
            |--------------------------------------------------------------------------
            | CREATE NEW VIRTUAL ACCOUNT
            |--------------------------------------------------------------------------
            */

            await connection.query(
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
                    accountName
                ]
            );


            /*
            |--------------------------------------------------------------------------
            | RECORD PAYMENT
            |--------------------------------------------------------------------------
            */

            const reference =
                "ADD_" +
                Date.now() +
                "_" +
                crypto
                    .randomBytes(5)
                    .toString("hex");


            await connection.query(
                `
                INSERT INTO account_payments
                (
                    user_id,
                    virtual_account_id,
                    amount,
                    reference,
                    status
                )
                VALUES
                (
                    ?,
                    ?,
                    ?,
                    ?,
                    'success'
                )
                `,
                [
                    userId,
                    sourceAccount.id,
                    ACCOUNT_CREATION_FEE,
                    reference
                ]
            );


            /*
            |--------------------------------------------------------------------------
            | GET NEW BALANCE
            |--------------------------------------------------------------------------
            */

            const [updated] =
                await connection.query(
                    `
                    SELECT balance
                    FROM virtual_account
                    WHERE id = ?
                    LIMIT 1
                    `,
                    [sourceAccount.id]
                );


            await connection.commit();


            /*
            |--------------------------------------------------------------------------
            | RETURN SUCCESS
            |--------------------------------------------------------------------------
            */

            return res.json({

                success: true,

                message:
                    "New virtual account created successfully.",

                source_account:
                    sourceAccount.accountno,

                amount_paid:
                    ACCOUNT_CREATION_FEE,

                remaining_balance:
                    Number(
                        updated[0].balance
                    ),

                new_account:
                    newAccountNo,

                account_name:
                    accountName

            });


        } catch (error) {

            await connection.rollback();

            console.error(
                "ADD ACCOUNT ERROR:",
                error
            );


            return res.status(500).json({

                success: false,

                message:
                    error.message ||
                    "Unable to create new account."

            });

        } finally {

            connection.release();

        }

    }
);



/*
|--------------------------------------------------------------------------
| PAYSTACK INITIALIZE ADDITIONAL ACCOUNT
|--------------------------------------------------------------------------
| POST /api/auth/accounts/add/paystack/initialize
|
| PROTECTED
|--------------------------------------------------------------------------
*/

router.post(
    "/accounts/add/paystack/initialize",
    authenticate,
    async (req, res) => {

        try {

            const userId =
                req.user.id;


            /*
            |--------------------------------------------------------------------------
            | GET USER
            |--------------------------------------------------------------------------
            */

            const [users] =
                await pool.query(
                    `
                    SELECT
                        id,
                        full_name,
                        email
                    FROM users
                    WHERE id = ?
                    LIMIT 1
                    `,
                    [
                        userId
                    ]
                );


            if (
                !users.length
            ) {

                return res.status(404).json({

                    success: false,

                    message:
                        "User account was not found."

                });

            }


            const user =
                users[0];


            if (
                !user.email
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "No email address is registered for this user."

                });

            }


            const PAYSTACK_SECRET_KEY =
                process.env.PAYSTACK_SECRET_KEY;


            if (
                !PAYSTACK_SECRET_KEY
            ) {

                return res.status(500).json({

                    success: false,

                    message:
                        "Paystack configuration is missing."

                });

            }


            /*
            |--------------------------------------------------------------------------
            | FIXED PAYMENT AMOUNT
            |--------------------------------------------------------------------------
            */

            const amountInKobo =
                ADD_ACCOUNT_FEE * 100;


            /*
            |--------------------------------------------------------------------------
            | PAYMENT REFERENCE
            |--------------------------------------------------------------------------
            */

            const reference =
                "ACCOUNT_" +
                user.id +
                "_" +
                Date.now() +
                "_" +
                crypto
                    .randomBytes(4)
                    .toString("hex");


            const connection =
                await pool.getConnection();


            try {

                await connection.beginTransaction();


                /*
                |--------------------------------------------------------------------------
                | GENERATE ACCOUNT NUMBER
                |--------------------------------------------------------------------------
                */

                const newAccountNo =
                    await generateUniqueAccountNumber(
                        connection
                    );


                /*
                |--------------------------------------------------------------------------
                | CREATE INACTIVE ACCOUNT
                |--------------------------------------------------------------------------
                */

                const [accountResult] =
                    await connection.query(
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
                            'inactive',
                            0.00
                        )
                        `,
                        [
                            user.id,
                            newAccountNo,
                            user.full_name
                        ]
                    );


                /*
                |--------------------------------------------------------------------------
                | CREATE PENDING PAYMENT
                |--------------------------------------------------------------------------
                */

                await connection.query(
                    `
                    INSERT INTO account_payments
                    (
                        user_id,
                        virtual_account_id,
                        reference,
                        amount,
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
                        user.id,
                        accountResult.insertId,
                        reference,
                        ADD_ACCOUNT_FEE
                    ]
                );


                await connection.commit();


                /*
                |--------------------------------------------------------------------------
                | INITIALIZE PAYSTACK
                |--------------------------------------------------------------------------
                */

                const paystackResponse =
                    await axios.post(
                        "https://api.paystack.co/transaction/initialize",
                        {
                            email:
                                user.email.trim(),

                            amount:
                                amountInKobo,

                            reference:
                                reference,

                            metadata: {

                                user_id:
                                    user.id,

                                payment_type:
                                    "additional_account",

                                virtual_account_id:
                                    accountResult.insertId,

                                account_number:
                                    newAccountNo,

                                amount:
                                    ADD_ACCOUNT_FEE

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
                    !paystackResponse.data.status
                ) {

                    throw new Error(
                        paystackResponse
                            .data
                            ?.message ||
                        "Unable to initialize Paystack payment."
                    );

                }


                return res.json({

                    success: true,

                    message:
                        "Paystack payment initialized.",

                    data: {

                        reference:
                            reference,

                        accountno:
                            newAccountNo,

                        authorization_url:
                            paystackResponse
                                .data
                                .data
                                .authorization_url,

                        access_code:
                            paystackResponse
                                .data
                                .data
                                .access_code,

                        amount:
                            ADD_ACCOUNT_FEE

                    }

                });


            } catch (error) {

                try {

                    await connection.rollback();

                } catch (_) {}


                throw error;

            } finally {

                connection.release();

            }


        } catch (error) {

            console.error(
                "ADD ACCOUNT PAYSTACK ERROR:",
                error.response?.data ||
                error.message
            );


            return res.status(
                error.response?.status || 500
            ).json({

                success: false,

                message:
                    error.response
                        ?.data
                        ?.message ||
                    error.message ||
                    "Unable to initialize Paystack payment."

            });

        }

    }
);


/*
|--------------------------------------------------------------------------
| VERIFY PAYSTACK ADDITIONAL ACCOUNT
|--------------------------------------------------------------------------
| GET /api/auth/accounts/add/paystack/verify/:reference
|
| PROTECTED
|--------------------------------------------------------------------------
*/

router.get(
    "/accounts/add/paystack/verify/:reference",
    authenticate,
    async (req, res) => {

        const connection =
            await pool.getConnection();


        try {

            const userId =
                req.user.id;

            const reference =
                req.params.reference;


            if (
                !reference
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Payment reference is required."

                });

            }


            const PAYSTACK_SECRET_KEY =
                process.env.PAYSTACK_SECRET_KEY;


            if (
                !PAYSTACK_SECRET_KEY
            ) {

                return res.status(500).json({

                    success: false,

                    message:
                        "Paystack configuration is missing."

                });

            }


            /*
            |--------------------------------------------------------------------------
            | VERIFY PAYMENT WITH PAYSTACK
            |--------------------------------------------------------------------------
            */

            const paystackResponse =
                await axios.get(
                    "https://api.paystack.co/transaction/verify/" +
                    encodeURIComponent(reference),
                    {
                        headers: {

                            Authorization:
                                `Bearer ${PAYSTACK_SECRET_KEY}`

                        }
                    }
                );


            const transaction =
                paystackResponse
                    .data
                    ?.data;


            if (
                !paystackResponse.data?.status ||
                !transaction
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Unable to verify payment."

                });

            }


            if (
                transaction.status !==
                "success"
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Payment has not been completed.",

                    payment_status:
                        transaction.status

                });

            }


            await connection.beginTransaction();


            /*
            |--------------------------------------------------------------------------
            | LOCK PAYMENT
            |--------------------------------------------------------------------------
            */

            const [payments] =
                await connection.query(
                    `
                    SELECT *
                    FROM account_payments
                    WHERE reference = ?
                    AND user_id = ?
                    LIMIT 1
                    FOR UPDATE
                    `,
                    [
                        reference,
                        userId
                    ]
                );


            if (
                !payments.length
            ) {

                await connection.rollback();

                return res.status(404).json({

                    success: false,

                    message:
                        "Account payment was not found."

                });

            }


            const payment =
                payments[0];


            /*
            |--------------------------------------------------------------------------
            | PREVENT DOUBLE PROCESSING
            |--------------------------------------------------------------------------
            */

            if (
                payment.status ===
                "successful"
            ) {

                await connection.rollback();

                return res.json({

                    success: true,

                    message:
                        "Account payment was already processed.",

                    already_processed:
                        true

                });

            }


            /*
            |--------------------------------------------------------------------------
            | VERIFY EXACT AMOUNT
            |--------------------------------------------------------------------------
            */

            const expectedKobo =
                Number(
                    payment.amount
                ) * 100;


            if (
                Number(
                    transaction.amount
                ) !== expectedKobo
            ) {

                await connection.query(
                    `
                    UPDATE account_payments
                    SET status = 'failed'
                    WHERE id = ?
                    `,
                    [
                        payment.id
                    ]
                );


                await connection.commit();


                return res.status(400).json({

                    success: false,

                    message:
                        "Payment amount does not match the required account fee."

                });

            }


            /*
            |--------------------------------------------------------------------------
            | LOCK PENDING ACCOUNT
            |--------------------------------------------------------------------------
            */

            const [accounts] =
                await connection.query(
                    `
                    SELECT *
                    FROM virtual_account
                    WHERE id = ?
                    AND user_id = ?
                    LIMIT 1
                    FOR UPDATE
                    `,
                    [
                        payment.virtual_account_id,
                        userId
                    ]
                );


            if (
                !accounts.length
            ) {

                await connection.rollback();

                return res.status(404).json({

                    success: false,

                    message:
                        "Pending account was not found."

                });

            }


            const account =
                accounts[0];


            /*
            |--------------------------------------------------------------------------
            | ACTIVATE ACCOUNT
            |--------------------------------------------------------------------------
            */

            await connection.query(
                `
                UPDATE virtual_account
                SET status = 'active'
                WHERE id = ?
                AND user_id = ?
                `,
                [
                    account.id,
                    userId
                ]
            );


            /*
            |--------------------------------------------------------------------------
            | MARK PAYMENT SUCCESSFUL
            |--------------------------------------------------------------------------
            */

            await connection.query(
                `
                UPDATE account_payments
                SET
                    status = 'successful',
                    transaction_id = ?,
                    paystack_status = ?,
                    paid_at = NOW()
                WHERE id = ?
                `,
                [
                    transaction.id,
                    transaction.status,
                    payment.id
                ]
            );


            await connection.commit();


            /*
            |--------------------------------------------------------------------------
            | SUCCESS
            |--------------------------------------------------------------------------
            */

            return res.json({

                success: true,

                message:
                    "Payment successful. New account has been activated.",

                data: {

                    accountno:
                        account.accountno,

                    account_name:
                        account.account_name,

                    amount:
                        Number(
                            payment.amount
                        ),

                    payment_method:
                        "paystack",

                    status:
                        "active"

                }

            });


        } catch (error) {

            try {

                await connection.rollback();

            } catch (_) {}


            console.error(
                "VERIFY ADD ACCOUNT PAYSTACK ERROR:",
                error.response?.data ||
                error.message
            );


            return res.status(
                error.response?.status || 500
            ).json({

                success: false,

                message:
                    error.response
                        ?.data
                        ?.message ||
                    error.message ||
                    "Unable to verify account payment."

            });


        } finally {

            connection.release();

        }

    }
);


/*
|--------------------------------------------------------------------------
| MANUAL ADDITIONAL ACCOUNT PAYMENT
|--------------------------------------------------------------------------
| POST /api/auth/accounts/add/manual
|
| PROTECTED
|--------------------------------------------------------------------------
*/

router.post(
    "/accounts/add/manual",
    authenticate,
    async (req, res) => {

        const connection =
            await pool.getConnection();


        try {

            const userId =
                req.user.id;


            /*
            |--------------------------------------------------------------------------
            | GET USER
            |--------------------------------------------------------------------------
            */

            const [users] =
                await connection.query(
                    `
                    SELECT
                        id,
                        full_name
                    FROM users
                    WHERE id = ?
                    LIMIT 1
                    `,
                    [
                        userId
                    ]
                );


            if (
                !users.length
            ) {

                return res.status(404).json({

                    success: false,

                    message:
                        "User account was not found."

                });

            }


            const user =
                users[0];


            await connection.beginTransaction();


            /*
            |--------------------------------------------------------------------------
            | GENERATE ACCOUNT NUMBER
            |--------------------------------------------------------------------------
            */

            const newAccountNo =
                await generateUniqueAccountNumber(
                    connection
                );


            /*
            |--------------------------------------------------------------------------
            | CREATE INACTIVE ACCOUNT
            |--------------------------------------------------------------------------
            */

            const [accountResult] =
                await connection.query(
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
                        'inactive',
                        0.00
                    )
                    `,
                    [
                        user.id,
                        newAccountNo,
                        user.full_name
                    ]
                );


            /*
            |--------------------------------------------------------------------------
            | PAYMENT REFERENCE
            |--------------------------------------------------------------------------
            */

            const reference =
                "MANUAL_ACCOUNT_" +
                user.id +
                "_" +
                Date.now() +
                "_" +
                crypto
                    .randomBytes(4)
                    .toString("hex");


            /*
            |--------------------------------------------------------------------------
            | RECORD MANUAL PAYMENT
            |--------------------------------------------------------------------------
            */

            await connection.query(
                `
                INSERT INTO account_payments
                (
                    user_id,
                    virtual_account_id,
                    reference,
                    amount,
                    payment_method,
                    status
                )
                VALUES
                (
                    ?,
                    ?,
                    ?,
                    ?,
                    'manual',
                    'pending'
                )
                `,
                [
                    user.id,
                    accountResult.insertId,
                    reference,
                    ADD_ACCOUNT_FEE
                ]
            );


            await connection.commit();


            /*
            |--------------------------------------------------------------------------
            | SUCCESS
            |--------------------------------------------------------------------------
            */

            return res.status(201).json({

                success: true,

                message:
                    "Manual payment request submitted. Your new account will be activated after payment approval.",

                data: {

                    accountno:
                        newAccountNo,

                    account_name:
                        user.full_name,

                    amount:
                        ADD_ACCOUNT_FEE,

                    reference:
                        reference,

                    status:
                        "pending"

                }

            });


        } catch (error) {

            try {

                await connection.rollback();

            } catch (_) {}


            console.error(
                "MANUAL ADD ACCOUNT ERROR:",
                error
            );


            return res.status(500).json({

                success: false,

                message:
                    error.message ||
                    "Unable to submit manual account payment."

            });


        } finally {

            connection.release();

        }

    }
);


/*
|--------------------------------------------------------------------------
| EXPORT ROUTER
|--------------------------------------------------------------------------
*/

module.exports = router;