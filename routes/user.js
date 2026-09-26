const express = require('express');

const pool = require('../config/db');

const {
    authenticate
} = require('../middleware/auth');

const router = express.Router();


/*
|--------------------------------------------------------------------------
| GET CURRENT USER
|--------------------------------------------------------------------------
| Endpoint:
| GET /api/user/me
|
| This endpoint requires a valid JWT token.
|
| The authenticate middleware reads the token and places
| the decoded user information inside req.auth.
|--------------------------------------------------------------------------
*/

router.get(
    '/me',
    authenticate,
    async (req, res) => {

        try {

            /*
            |--------------------------------------------------------------------------
            | GET USER INFORMATION
            |--------------------------------------------------------------------------
            |
            | We get:
            | - User information
            | - Payment status
            | - Account status
            | - Virtual account number
            | - Virtual account name
            |
            */

            const [rows] = await pool.query(

                `
                SELECT

                    u.id,

                    u.full_name,

                    u.email,

                    u.phone_number,

                    u.gender,

                    u.referral,

                    u.payment_status,

                    u.account_status,

                    u.created_at,

                    v.accountno AS account_number,

                    v.account_name

                FROM users u

                LEFT JOIN virtual_account v
                    ON v.user_id = u.id

                WHERE u.id = ?

                LIMIT 1
                `,

                [
                    req.auth.id
                ]

            );


            /*
            |--------------------------------------------------------------------------
            | USER NOT FOUND
            |--------------------------------------------------------------------------
            */

            if (!rows.length) {

                return res.status(404).json({

                    success: false,

                    message: 'User not found'

                });

            }


            /*
            |--------------------------------------------------------------------------
            | RETURN USER INFORMATION
            |--------------------------------------------------------------------------
            */

            return res.json({

                success: true,

                user: rows[0]

            });


        } catch (e) {

            /*
            |--------------------------------------------------------------------------
            | SERVER ERROR
            |--------------------------------------------------------------------------
            */

            console.error(e);


            return res.status(500).json({

                success: false,

                message: 'Unable to load dashboard'

            });

        }

    }
);






/* =========================================================
   HELPER
========================================================= */

function getUserId(req) {
    return (
        req.user?.user_id ||
        req.user?.id ||
        req.user?.userId ||
        null
    );
}


/* =========================================================
   GET MY PROFILE
   GET /api/user/profile
========================================================= */

router.get(
    "/profile",
    authenticate,
    async (req, res) => {

        try {

            const userId = getUserId(req);

            if (!userId) {
                return res.status(401).json({
                    success: false,
                    message: "User authentication required."
                });
            }


            const [users] = await pool.query(
                `
                SELECT
                    id,
                    fullname,
                    full_name,
                    first_name,
                    last_name,
                    gender,
                    email,
                    phone_number,
                    address,
                    nin,
                    bvn,
                    referral,
                    role,
                    status,
                    registration_status,
                    payment_status,
                    account_status,
                    virtual_account_status,
                    registration_fee,
                    payment_method,
                    balance,
                    created_at,
                    updated_at,

                    next_of_kin_full_name,
                    next_of_kin_phone,
                    next_of_kin_address,
                    next_of_kin_occupation,
                    next_of_kin_dob,
                    next_of_kin_gender

                FROM users
                WHERE id = ?
                LIMIT 1
                `,
                [userId]
            );


            if (!users.length) {
                return res.status(404).json({
                    success: false,
                    message: "User profile not found."
                });
            }


            const user = users[0];


            /* =================================================
               GET USER VIRTUAL ACCOUNTS
            ================================================= */

            const [accounts] = await pool.query(
                `
                SELECT
                    id,
                    user_id,
                    accountno,
                    account_name,
                    status,
                    created_at,
                    balance,
                    virtual_account_id,
                    thrift_week_paid,
                    thrift_total_paid,
                    thrift_last_deduction_date,
                    default_weeks
                FROM virtual_account
                WHERE user_id = ?
                ORDER BY id ASC
                `,
                [userId]
            );


            /* =================================================
               ADD ACCOUNT TYPE
               FIRST ACCOUNT = PRIMARY
               OTHER ACCOUNTS = OTHERS
            ================================================= */

            const formattedAccounts = accounts.map(
                (account, index) => {

                    return {
                        ...account,

                        account_type:
                            index === 0
                                ? "primary"
                                : "others"
                    };

                }
            );


            return res.json({
                success: true,

                user: {
                    id: user.id,

                    full_name:
                        user.full_name ||
                        user.fullname ||
                        `${user.first_name || ""} ${user.last_name || ""}`.trim(),

                    first_name: user.first_name || "",
                    last_name: user.last_name || "",

                    email: user.email || "",
                    phone_number: user.phone_number || "",
                    gender: user.gender || "",
                    address: user.address || "",

                    nin: user.nin || "",
                    bvn: user.bvn || "",

                    referral: user.referral || "",

                    role: user.role || "",
                    status: user.status || "",

                    registration_status:
                        user.registration_status || "",

                    payment_status:
                        user.payment_status || "",

                    account_status:
                        user.account_status || "",

                    virtual_account_status:
                        user.virtual_account_status || "",

                    registration_fee:
                        user.registration_fee || 0,

                    payment_method:
                        user.payment_method || "",

                    balance:
                        Number(user.balance || 0),

                    created_at: user.created_at,
                    updated_at: user.updated_at
                },


                next_of_kin: {
                    full_name:
                        user.next_of_kin_full_name || "",

                    phone:
                        user.next_of_kin_phone || "",

                    address:
                        user.next_of_kin_address || "",

                    occupation:
                        user.next_of_kin_occupation || "",

                    dob:
                        user.next_of_kin_dob || "",

                    gender:
                        user.next_of_kin_gender || ""
                },


                accounts: formattedAccounts
            });

        } catch (error) {

            console.error(
                "GET PROFILE ERROR:",
                error
            );

            return res.status(500).json({
                success: false,
                message: "Unable to load profile.",
                error: error.message
            });
        }
    }
);


/* =========================================================
   UPDATE PERSONAL INFORMATION
   PUT /api/user/profile
========================================================= */

router.put(
    "/profile",
    authenticate,
    async (req, res) => {

        try {

            const userId = getUserId(req);

            if (!userId) {
                return res.status(401).json({
                    success: false,
                    message: "User authentication required."
                });
            }


            const {
                full_name,
                email,
                phone_number,
                gender,
                address
            } = req.body;


            await pool.query(
                `
                UPDATE users
                SET
                    full_name = ?,
                    email = ?,
                    phone_number = ?,
                    gender = ?,
                    address = ?,
                    updated_at = NOW()
                WHERE id = ?
                `,
                [
                    full_name || null,
                    email || null,
                    phone_number || null,
                    gender || null,
                    address || null,
                    userId
                ]
            );


            return res.json({
                success: true,
                message: "Personal information updated successfully."
            });

        } catch (error) {

            console.error(
                "UPDATE PROFILE ERROR:",
                error
            );

            return res.status(500).json({
                success: false,
                message: "Unable to update personal information.",
                error: error.message
            });
        }
    }
);


/* =========================================================
   UPDATE NEXT OF KIN
   PUT /api/user/next-of-kin
========================================================= */

router.put(
    "/next-of-kin",
    authenticate,
    async (req, res) => {

        try {

            const userId = getUserId(req);

            if (!userId) {
                return res.status(401).json({
                    success: false,
                    message: "User authentication required."
                });
            }


            const {
                full_name,
                phone,
                address,
                occupation,
                dob,
                gender
            } = req.body;


            await pool.query(
                `
                UPDATE users
                SET
                    next_of_kin_full_name = ?,
                    next_of_kin_phone = ?,
                    next_of_kin_address = ?,
                    next_of_kin_occupation = ?,
                    next_of_kin_dob = ?,
                    next_of_kin_gender = ?,
                    updated_at = NOW()
                WHERE id = ?
                `,
                [
                    full_name || null,
                    phone || null,
                    address || null,
                    occupation || null,
                    dob || null,
                    gender || null,
                    userId
                ]
            );


            return res.json({
                success: true,
                message: "Next of kin information updated successfully."
            });

        } catch (error) {

            console.error(
                "UPDATE NEXT OF KIN ERROR:",
                error
            );

            return res.status(500).json({
                success: false,
                message: "Unable to update next of kin information.",
                error: error.message
            });
        }
    }
);


/* =========================================================
   GET MY VIRTUAL ACCOUNTS
   GET /api/user/accounts
========================================================= */

router.get(
    "/accounts",
    authenticate,
    async (req, res) => {

        try {

            const userId = getUserId(req);

            if (!userId) {
                return res.status(401).json({
                    success: false,
                    message: "User authentication required."
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
                    created_at,
                    balance,
                    virtual_account_id,
                    thrift_week_paid,
                    thrift_total_paid,
                    thrift_last_deduction_date,
                    default_weeks
                FROM virtual_account
                WHERE user_id = ?
                ORDER BY id ASC
                `,
                [userId]
            );


            const formattedAccounts =
                accounts.map((account, index) => ({
                    ...account,

                    account_type:
                        index === 0
                            ? "primary"
                            : "others",

                    balance:
                        Number(account.balance || 0),

                    thrift_week_paid:
                        Number(account.thrift_week_paid || 0),

                    thrift_total_paid:
                        Number(account.thrift_total_paid || 0),

                    default_weeks:
                        Number(account.default_weeks || 0)
                }));


            return res.json({
                success: true,
                accounts: formattedAccounts
            });

        } catch (error) {

            console.error(
                "GET ACCOUNTS ERROR:",
                error
            );

            return res.status(500).json({
                success: false,
                message: "Unable to load accounts.",
                error: error.message
            });
        }
    }
);


module.exports = router;





/*
|--------------------------------------------------------------------------
| EXPORT ROUTER
|--------------------------------------------------------------------------
*/

module.exports = router;