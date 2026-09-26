const express = require("express");
const pool = require("../config/db");
const { authenticate } = require("../middleware/auth");

const router = express.Router();


/* =====================================================
   GET USER VIRTUAL ACCOUNTS
   GET /api/dashboard/virtual-accounts
===================================================== */

router.get(
    "/accounts",
    authenticate,
    async (req, res) => {

        try {

            /*
            |--------------------------------------------------------------------------
            | GET LOGGED-IN USER ID
            |--------------------------------------------------------------------------
            */

            const userId =
                req.user.user_id ||
                req.user.id ||
                req.user.userId;


            if (!userId) {

                return res.status(401).json({
                    success: false,
                    message: "User authentication information is missing."
                });

            }


            console.log(
                "Loading all virtual accounts for user:",
                userId
            );


            /*
            |--------------------------------------------------------------------------
            | GET ALL VIRTUAL ACCOUNTS
            |--------------------------------------------------------------------------
            */

            const [accounts] = await pool.query(
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


            /*
            |--------------------------------------------------------------------------
            | NO VIRTUAL ACCOUNTS
            |--------------------------------------------------------------------------
            */

            if (!accounts || accounts.length === 0) {

                console.log(
                    "No virtual accounts found for user:",
                    userId
                );


                return res.json({

                    success: true,

                    message:
                        "No virtual account found.",

                    accounts: []

                });

            }


            /*
            |--------------------------------------------------------------------------
            | NORMALIZE ALL ACCOUNTS
            |--------------------------------------------------------------------------
            */

            const virtualAccounts =
                accounts.map(account => ({

                    id:
                        account.id,

                    accountno:
                        account.accountno,

                    account_name:
                        account.account_name || "",

                    status:
                        account.status || "active",

                    balance:
                        account.balance || 0,

                    created_at:
                        account.created_at

                }));


            /*
            |--------------------------------------------------------------------------
            | RETURN ALL ACCOUNTS
            |--------------------------------------------------------------------------
            */

            return res.json({

                success: true,

                message:
                    "Virtual accounts loaded successfully.",

                accounts:
                    virtualAccounts

            });


        } catch (error) {

            console.error(
                "GET VIRTUAL ACCOUNTS ERROR:",
                error
            );


            return res.status(500).json({

                success: false,

                message:
                    "Unable to load virtual accounts.",

                error:
                    process.env.NODE_ENV === "development"
                        ? error.message
                        : undefined

            });

        }

    }
);




/*
|--------------------------------------------------------------------------
| SWITCH ACTIVE VIRTUAL ACCOUNT
|--------------------------------------------------------------------------
|
| The account is identified by accountno.
|
| IMPORTANT:
| The user_id comes from JWT.
| Never trust user_id sent by the browser.
|
|--------------------------------------------------------------------------
*/

router.get(
    "/account/:accountno",
    authenticate,
    async (req, res) => {

        try {

            const userId =
                req.user.id;


            const accountno =
                String(
                    req.params.accountno || ""
                ).trim();


            if (!accountno) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Account number is required."

                });

            }


            console.log(
                "SWITCH ACCOUNT:",
                {
                    userId,
                    accountno
                }
            );


            /*
            |--------------------------------------------------------------------------
            | FIND ONLY THIS USER'S ACCOUNT
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
                        balance,
                        created_at
                    FROM virtual_account
                    WHERE
                        user_id = ?
                    AND
                        accountno = ?
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
                        "Virtual account not found."

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
                        "This virtual account is inactive."

                });

            }


            /*
            |--------------------------------------------------------------------------
            | RETURN BALANCE DIRECTLY FROM
            | virtual_account.balance
            |--------------------------------------------------------------------------
            */

            return res.json({

                success: true,

                message:
                    "Virtual account switched successfully.",

                account: {

                    id:
                        account.id,

                    accountno:
                        account.accountno,

                    account_name:
                        account.account_name,

                    status:
                        account.status,

                    balance:
                        Number(
                            account.balance || 0
                        ),

                    created_at:
                        account.created_at

                }

            });


        } catch (error) {

            console.error(
                "SWITCH ACCOUNT ERROR:",
                error
            );


            return res.status(500).json({

                success: false,

                message:
                    "Unable to switch virtual account."

            });

        }

    }
);



/* =====================================================
   THRIFT DASHBOARD SUMMARY
===================================================== */

router.get(
    "/thrift-summary",
    authenticate,
    async (req, res) => {

        try {

            /*
            |--------------------------------------------------------------------------
            | GET LOGGED-IN USER ID
            |--------------------------------------------------------------------------
            */

            const userId =
                req.user.user_id ||
                req.user.id;


            if (!userId) {

                return res.status(401).json({
                    success: false,
                    message: "User ID not found"
                });

            }


            /*
            |--------------------------------------------------------------------------
            | GET SELECTED ACCOUNT NUMBER
            |--------------------------------------------------------------------------
            */

            const accountno =
                req.query.accountno;


            /*
            |--------------------------------------------------------------------------
            | 1. TOTAL THRIFT ACCOUNTS
            |--------------------------------------------------------------------------
            */

            const [thriftAccounts] = await pool.query(
                `
                SELECT COUNT(*) AS total_thrift_accounts
                FROM thrift_subscribe
                WHERE user_id = ?
                `,
                [userId]
            );


            /*
            |--------------------------------------------------------------------------
            | 2. CURRENT THRIFT WEEKS
            |--------------------------------------------------------------------------
            */

            const [thriftWeeks] = await pool.query(
                `
                SELECT COALESCE(
                    SUM(current_weeks),
                    0
                ) AS current_thrift_weeks
                FROM thrift_subscribe
                WHERE user_id = ?
                `,
                [userId]
            );


            /*
            |--------------------------------------------------------------------------
            | 3. TOTAL CONTRIBUTION
            |--------------------------------------------------------------------------
            | Get thrift_total_paid from virtual_account
            | using the ACCOUNTNO selected in the dropdown.
            |--------------------------------------------------------------------------
            */

            let totalContribution = 0;


            if (accountno) {

                const [contribution] = await pool.query(
                    `
                    SELECT COALESCE(
                        SUM(thrift_total_paid),
                        0
                    ) AS total_contribution
                    FROM virtual_account
                    WHERE accountno = ?
                    `,
                    [accountno]
                );


                totalContribution =
                    Number(
                        contribution[0].total_contribution || 0
                    );

            }


            /*
            |--------------------------------------------------------------------------
            | RESPONSE
            |--------------------------------------------------------------------------
            */

            return res.json({

                success: true,

                data: {

                    total_thrift_accounts:
                        Number(
                            thriftAccounts[0]
                                .total_thrift_accounts || 0
                        ),

                    current_thrift_weeks:
                        Number(
                            thriftWeeks[0]
                                .current_thrift_weeks || 0
                        ),

                    total_contribution:
                        totalContribution

                }

            });

        } catch (error) {

            console.error(
                "THRIFT DASHBOARD SUMMARY ERROR:",
                error
            );

            return res.status(500).json({

                success: false,

                message:
                    "Failed to load thrift dashboard summary"

            });

        }

    }
);



/* =====================================================
   GET USER VIRTUAL ACCOUNT
   GET /api/dashboard/virtual-accounts
===================================================== */

router.get(
    "/virtual-accounts",
    authenticate,
    async (req, res) => {

        try {

            /*
            |--------------------------------------------------------------------------
            | GET LOGGED-IN USER ID
            |--------------------------------------------------------------------------
            */

            const userId =
                req.user.user_id ||
                req.user.id ||
                req.user.userId;


            if (!userId) {

                return res.status(401).json({
                    success: false,
                    message: "User authentication information is missing."
                });

            }


            console.log(
                "Loading virtual account for user:",
                userId
            );


            /*
            |--------------------------------------------------------------------------
            | GET FIRST VIRTUAL ACCOUNT
            |--------------------------------------------------------------------------
            |
            | Only one virtual account is returned.
            |
            */

            const [accounts] = await pool.query(
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


            /*
            |--------------------------------------------------------------------------
            | NO VIRTUAL ACCOUNT
            |--------------------------------------------------------------------------
            */

            if (!accounts || accounts.length === 0) {

                console.log(
                    "No virtual account found for user:",
                    userId
                );


                return res.json({
                    success: true,
                    message: "No virtual account found.",
                    accounts: []
                });

            }


            /*
            |--------------------------------------------------------------------------
            | GET FIRST ACCOUNT
            |--------------------------------------------------------------------------
            */

            const account = accounts[0];


            /*
            |--------------------------------------------------------------------------
            | NORMALIZE RESPONSE
            |--------------------------------------------------------------------------
            */

            const virtualAccount = {

                id:
                    account.id,

                accountno:
                    account.accountno,

                account_name:
                    account.account_name || "",

                status:
                    account.status || "active",

                balance:
                    account.balance || 0,

                created_at:
                    account.created_at

            };


            /*
            |--------------------------------------------------------------------------
            | RETURN ACCOUNT
            |--------------------------------------------------------------------------
            */

            return res.json({

                success: true,

                message:
                    "Virtual account loaded successfully.",

                accounts: [
                    virtualAccount
                ]

            });


        } catch (error) {

            console.error(
                "GET VIRTUAL ACCOUNT ERROR:",
                error
            );


            return res.status(500).json({

                success: false,

                message:
                    "Unable to load virtual account.",

                error:
                    process.env.NODE_ENV === "development"
                        ? error.message
                        : undefined

            });

        }

    }
);


module.exports = router;