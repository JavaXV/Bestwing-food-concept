const express = require("express");

const pool = require("../config/db");

const {
    authenticate,
    requireAdmin
} = require("../middleware/auth");

const {
    activateUser
} = require("../services/account");

const router = express.Router();




/*
|--------------------------------------------------------------------------
| ADMIN ROUTES
|--------------------------------------------------------------------------
|
| This file handles:
|
| 1. Manual registration payment approval/rejection
| 2. Manual virtual account wallet funding approval/rejection
|
| 3. Find Due Thrift
| 4. Find Clearance
| 5. Find Thrift
| 6. List All Accounts
| 7. List All Transactions
| 8. List All Wallet Transactions
| 9. Find Users
|
| All management routes require:
|
| authenticate
| requireAdmin
|
|--------------------------------------------------------------------------
*/


/*
|--------------------------------------------------------------------------
| CONSTANTS
|--------------------------------------------------------------------------
*/

const WEEKLY_THRIFT_AMOUNT = 1500;

const MAX_THRIFT_WEEKS = 50;

const TOTAL_THRIFT_CONTRIBUTION =
    WEEKLY_THRIFT_AMOUNT * MAX_THRIFT_WEEKS;

const CLEARANCE_FEE = 2000;


/*
|--------------------------------------------------------------------------
| HELPER
|--------------------------------------------------------------------------
*/

function getAdminId(req) {

    return (
        req.user?.id ||
        req.auth?.id ||
        null
    );

}


/*
|--------------------------------------------------------------------------
| HELPER
|--------------------------------------------------------------------------
*/

function numberValue(value) {

    const number =
        Number(value);

    return Number.isFinite(number)
        ? number
        : 0;

}


/* ==========================================================================
   ==========================================================================
   
      MANUAL VIRTUAL ACCOUNT WALLET FUNDING

   ==========================================================================
   ========================================================================== */


/*
|--------------------------------------------------------------------------
| 1. LOAD PENDING MANUAL WALLET PAYMENTS
|--------------------------------------------------------------------------
|
| GET
| /api/admin/manual-wallet-payments
|
|--------------------------------------------------------------------------
*/

router.get(
    "/manual-wallet-payments",
    authenticate,
    requireAdmin,
    async (req, res) => {

        try {

            const [payments] =
                await pool.query(
                    `
                    SELECT

                        p.id,

                        p.user_id,

                        p.amount,

                        p.payment_type,

                        p.payment_method,

                        p.reference,

                        p.status,

                        p.virtual_account_id,

                        p.created_at,

                        u.full_name,

                        u.email,

                        u.phone_number,

                        va.accountno,

                        va.account_name,

                        COALESCE(
                            va.balance,
                            0
                        ) AS current_balance

                    FROM payments p

                    INNER JOIN users u
                        ON u.id = p.user_id

                    INNER JOIN virtual_account va
                        ON va.id = p.virtual_account_id

                    WHERE

                        LOWER(
                            COALESCE(
                                p.status,
                                ''
                            )
                        ) = 'pending'

                    AND

                        (
                            LOWER(
                                COALESCE(
                                    p.payment_type,
                                    ''
                                )
                            ) = 'wallet_fund'

                            OR

                            LOWER(
                                COALESCE(
                                    p.payment_type,
                                    ''
                                )
                            ) = 'bank_transfer'

                            OR

                            LOWER(
                                COALESCE(
                                    p.payment_type,
                                    ''
                                )
                            ) = 'bank transfer'

                            OR

                            LOWER(
                                COALESCE(
                                    p.payment_method,
                                    ''
                                )
                            ) = 'bank_transfer'
                        )

                    AND

                        (
                            p.reference LIKE 'MANUAL-WALLET-%'

                            OR

                            p.reference LIKE 'VACC-%'

                            OR

                            p.reference LIKE 'MANUAL_WALLET_%'
                        )

                    ORDER BY
                        p.created_at DESC
                    `
                );


            return res.status(200).json({

                success: true,

                count:
                    payments.length,

                payments:
                    payments.map(
                        payment => ({

                            id:
                                payment.id,

                            user_id:
                                payment.user_id,

                            full_name:
                                payment.full_name ||
                                "Unknown User",

                            email:
                                payment.email ||
                                "",

                            phone_number:
                                payment.phone_number ||
                                "",

                            amount:
                                numberValue(
                                    payment.amount
                                ),

                            payment_type:
                                payment.payment_type,

                            payment_method:
                                payment.payment_method,

                            reference:
                                payment.reference,

                            status:
                                payment.status,

                            virtual_account_id:
                                payment.virtual_account_id,

                            accountno:
                                payment.accountno,

                            account_name:
                                payment.account_name,

                            current_balance:
                                numberValue(
                                    payment.current_balance
                                ),

                            created_at:
                                payment.created_at

                        })
                    )

            });

        } catch (error) {

            console.error(
                "LOAD MANUAL WALLET PAYMENTS ERROR:",
                error
            );

            return res.status(500).json({

                success: false,

                message:
                    error.sqlMessage ||
                    error.message ||
                    "Unable to load manual wallet payments."

            });

        }

    }
);


/*
|--------------------------------------------------------------------------
| 2. APPROVE MANUAL WALLET PAYMENT
|--------------------------------------------------------------------------
|
| POST
| /api/admin/manual-wallet-payments/:id/approve
|
|--------------------------------------------------------------------------
*/

router.post(
    "/manual-wallet-payments/:id/approve",
    authenticate,
    requireAdmin,
    async (req, res) => {

        const paymentId =
            Number(
                req.params.id
            );


        if (
            !Number.isInteger(paymentId) ||
            paymentId <= 0
        ) {

            return res.status(400).json({

                success: false,

                message:
                    "Invalid payment ID."

            });

        }


        const conn =
            await pool.getConnection();


        try {

            await conn.beginTransaction();


            /*
            |--------------------------------------------------------------------------
            | LOCK PAYMENT
            |--------------------------------------------------------------------------
            */

            const [payments] =
                await conn.query(
                    `
                    SELECT

                        p.id,

                        p.user_id,

                        p.amount,

                        p.payment_type,

                        p.payment_method,

                        p.reference,

                        p.status,

                        p.virtual_account_id

                    FROM payments p

                    WHERE

                        p.id = ?

                    AND

                        LOWER(
                            COALESCE(
                                p.status,
                                ''
                            )
                        ) = 'pending'

                    LIMIT 1

                    FOR UPDATE
                    `,
                    [
                        paymentId
                    ]
                );


            if (!payments.length) {

                await conn.rollback();

                return res.status(404).json({

                    success: false,

                    message:
                        "Pending wallet funding payment was not found or has already been processed."

                });

            }


            const payment =
                payments[0];


            /*
            |--------------------------------------------------------------------------
            | VERIFY MANUAL WALLET FUNDING
            |--------------------------------------------------------------------------
            */

            const reference =
                String(
                    payment.reference || ""
                );


            const paymentType =
                String(
                    payment.payment_type || ""
                ).toLowerCase();


            const paymentMethod =
                String(
                    payment.payment_method || ""
                ).toLowerCase();


            const isManualWalletFunding =
                reference.startsWith(
                    "MANUAL-WALLET-"
                ) ||

                reference.startsWith(
                    "VACC-"
                ) ||

                reference.startsWith(
                    "MANUAL_WALLET_"
                ) ||

                paymentType ===
                    "wallet_fund" ||

                paymentMethod ===
                    "bank_transfer";


            if (!isManualWalletFunding) {

                await conn.rollback();

                return res.status(400).json({

                    success: false,

                    message:
                        "This payment is not a valid manual wallet funding transaction."

                });

            }


            /*
            |--------------------------------------------------------------------------
            | VIRTUAL ACCOUNT REQUIRED
            |--------------------------------------------------------------------------
            */

            if (
                !payment.virtual_account_id
            ) {

                await conn.rollback();

                return res.status(400).json({

                    success: false,

                    message:
                        "This payment is not linked to a virtual account."

                });

            }


            /*
            |--------------------------------------------------------------------------
            | LOCK VIRTUAL ACCOUNT
            |--------------------------------------------------------------------------
            */

            const [accounts] =
                await conn.query(
                    `
                    SELECT

                        id,

                        user_id,

                        accountno,

                        account_name,

                        status,

                        COALESCE(
                            balance,
                            0
                        ) AS balance

                    FROM virtual_account

                    WHERE id = ?

                    LIMIT 1

                    FOR UPDATE
                    `,
                    [
                        payment.virtual_account_id
                    ]
                );


            if (!accounts.length) {

                await conn.rollback();

                return res.status(404).json({

                    success: false,

                    message:
                        "The virtual account linked to this payment was not found."

                });

            }


            const account =
                accounts[0];


            /*
            |--------------------------------------------------------------------------
            | VERIFY OWNER
            |--------------------------------------------------------------------------
            */

            if (
                Number(account.user_id) !==
                Number(payment.user_id)
            ) {

                await conn.rollback();

                return res.status(400).json({

                    success: false,

                    message:
                        "Payment and virtual account ownership do not match."

                });

            }


            /*
            |--------------------------------------------------------------------------
            | ACCOUNT ACTIVE
            |--------------------------------------------------------------------------
            */

            if (
                String(
                    account.status || ""
                ).toLowerCase() !==
                "active"
            ) {

                await conn.rollback();

                return res.status(400).json({

                    success: false,

                    message:
                        "The virtual account is inactive."

                });

            }


            /*
            |--------------------------------------------------------------------------
            | VALIDATE AMOUNT
            |--------------------------------------------------------------------------
            */

            const amount =
                numberValue(
                    payment.amount
                );


            if (
                amount <= 0
            ) {

                await conn.rollback();

                return res.status(400).json({

                    success: false,

                    message:
                        "Invalid payment amount."

                });

            }


            const adminId =
                getAdminId(req);


            /*
            |--------------------------------------------------------------------------
            | LOCK ACCOUNT PAYMENT
            |--------------------------------------------------------------------------
            */

            const [accountPayments] =
                await conn.query(
                    `
                    SELECT

                        id,

                        amount,

                        status,

                        reference

                    FROM account_payments

                    WHERE reference = ?

                    LIMIT 1

                    FOR UPDATE
                    `,
                    [
                        payment.reference
                    ]
                );


            if (
                accountPayments.length
            ) {

                const accountPayment =
                    accountPayments[0];


                if (
                    numberValue(
                        accountPayment.amount
                    ) !== amount
                ) {

                    await conn.rollback();

                    return res.status(400).json({

                        success: false,

                        message:
                            "Payment amount does not match the account payment record."

                    });

                }


                if (
                    String(
                        accountPayment.status ||
                        ""
                    ).toLowerCase() ===
                    "success"
                ) {

                    await conn.rollback();

                    return res.status(409).json({

                        success: false,

                        message:
                            "This payment has already been approved."

                    });

                }

            }


            /*
            |--------------------------------------------------------------------------
            | LOCK WALLET TRANSACTION
            |--------------------------------------------------------------------------
            */

            const [walletTransactions] =
                await conn.query(
                    `
                    SELECT

                        id,

                        amount,

                        status,

                        reference

                    FROM wallet_transactions

                    WHERE

                        user_id = ?

                    AND

                        accountno = ?

                    AND

                        reference = ?

                    LIMIT 1

                    FOR UPDATE
                    `,
                    [
                        payment.user_id,

                        account.accountno,

                        payment.reference
                    ]
                );


            if (
                !walletTransactions.length
            ) {

                await conn.rollback();

                return res.status(400).json({

                    success: false,

                    message:
                        "The pending wallet transaction for this payment was not found."

                });

            }


            const walletTransaction =
                walletTransactions[0];


            if (
                numberValue(
                    walletTransaction.amount
                ) !== amount
            ) {

                await conn.rollback();

                return res.status(400).json({

                    success: false,

                    message:
                        "Payment amount does not match the wallet transaction."

                });

            }


            if (
                [
                    "success",
                    "successful",
                    "approved"
                ].includes(
                    String(
                        walletTransaction.status ||
                        ""
                    ).toLowerCase()
                )
            ) {

                await conn.rollback();

                return res.status(409).json({

                    success: false,

                    message:
                        "This wallet transaction has already been processed."

                });

            }


            /*
            |--------------------------------------------------------------------------
            | BALANCE
            |--------------------------------------------------------------------------
            */

            const oldBalance =
                numberValue(
                    account.balance
                );


            const newBalance =
                oldBalance +
                amount;


            /*
            |--------------------------------------------------------------------------
            | CREDIT ACCOUNT
            |--------------------------------------------------------------------------
            */

            await conn.query(
                `
                UPDATE virtual_account

                SET

                    balance =
                        COALESCE(
                            balance,
                            0
                        ) + ?

                WHERE id = ?

                LIMIT 1
                `,
                [
                    amount,

                    account.id
                ]
            );


            /*
            |--------------------------------------------------------------------------
            | UPDATE PAYMENTS
            |--------------------------------------------------------------------------
            */

            const [paymentUpdate] =
                await conn.query(
                    `
                    UPDATE payments

                    SET

                        status = 'success',

                        approved_by = ?,

                        approved_at = NOW(),

                        updated_at = NOW()

                    WHERE

                        id = ?

                    AND

                        LOWER(
                            COALESCE(
                                status,
                                ''
                            )
                        ) = 'pending'

                    LIMIT 1
                    `,
                    [
                        adminId,

                        payment.id
                    ]
                );


            if (
                paymentUpdate.affectedRows !== 1
            ) {

                await conn.rollback();

                return res.status(400).json({

                    success: false,

                    message:
                        "Payment could not be marked as successful."

                });

            }


            /*
            |--------------------------------------------------------------------------
            | UPDATE WALLET TRANSACTION
            |--------------------------------------------------------------------------
            */

            await conn.query(
                `
                UPDATE wallet_transactions

                SET

                    status = 'success',

                    payment_method = ?,

                    paystack_status = 'success',

                    paid_at = NOW(),

                    updated_at = NOW()

                WHERE

                    id = ?

                AND

                    LOWER(
                        COALESCE(
                            status,
                            ''
                        )
                    ) = 'pending'

                LIMIT 1
                `,
                [
                    payment.payment_method ||
                        "BANK_TRANSFER",

                    walletTransaction.id
                ]
            );


            /*
            |--------------------------------------------------------------------------
            | UPDATE ACCOUNT PAYMENTS
            |--------------------------------------------------------------------------
            */

            if (
                accountPayments.length
            ) {

                await conn.query(
                    `
                    UPDATE account_payments

                    SET

                        status = 'success',

                        paystack_status = 'success',

                        paid_at = NOW(),

                        updated_at = NOW()

                    WHERE

                        id = ?

                    AND

                        LOWER(
                            COALESCE(
                                status,
                                ''
                            )
                        ) = 'pending'

                    LIMIT 1
                    `,
                    [
                        accountPayments[0].id
                    ]
                );

            }


            await conn.commit();


            return res.status(200).json({

                success: true,

                message:
                    "Manual wallet funding approved and virtual account credited successfully.",

                payment: {

                    id:
                        payment.id,

                    user_id:
                        payment.user_id,

                    amount:
                        amount,

                    reference:
                        payment.reference,

                    status:
                        "success"

                },

                wallet_transaction: {

                    id:
                        walletTransaction.id,

                    reference:
                        payment.reference,

                    accountno:
                        account.accountno,

                    amount:
                        amount,

                    status:
                        "success"

                },

                account: {

                    id:
                        account.id,

                    accountno:
                        account.accountno,

                    account_name:
                        account.account_name,

                    previous_balance:
                        oldBalance,

                    amount_credited:
                        amount,

                    balance:
                        newBalance

                }

            });


        } catch (error) {

            try {

                await conn.rollback();

            } catch (_) {}


            console.error(
                "APPROVE MANUAL WALLET PAYMENT ERROR:",
                error
            );


            return res.status(500).json({

                success: false,

                message:
                    error.sqlMessage ||
                    error.message ||
                    "Failed to approve manual wallet funding."

            });

        } finally {

            conn.release();

        }

    }
);


/*
|--------------------------------------------------------------------------
| 3. REJECT MANUAL WALLET PAYMENT
|--------------------------------------------------------------------------
|
| POST
| /api/admin/manual-wallet-payments/:id/reject
|
|--------------------------------------------------------------------------
*/

router.post(
    "/manual-wallet-payments/:id/reject",
    authenticate,
    requireAdmin,
    async (req, res) => {

        const paymentId =
            Number(
                req.params.id
            );


        if (
            !Number.isInteger(paymentId) ||
            paymentId <= 0
        ) {

            return res.status(400).json({

                success: false,

                message:
                    "Invalid payment ID."

            });

        }


        const conn =
            await pool.getConnection();


        try {

            await conn.beginTransaction();


            const [payments] =
                await conn.query(
                    `
                    SELECT

                        id,

                        user_id,

                        amount,

                        payment_type,

                        payment_method,

                        reference,

                        status,

                        virtual_account_id

                    FROM payments

                    WHERE

                        id = ?

                    AND

                        LOWER(
                            COALESCE(
                                status,
                                ''
                            )
                        ) = 'pending'

                    LIMIT 1

                    FOR UPDATE
                    `,
                    [
                        paymentId
                    ]
                );


            if (!payments.length) {

                await conn.rollback();

                return res.status(404).json({

                    success: false,

                    message:
                        "Pending wallet funding payment was not found or has already been processed."

                });

            }


            const payment =
                payments[0];


            const reference =
                String(
                    payment.reference || ""
                );


            if (
                !reference.startsWith(
                    "MANUAL-WALLET-"
                ) &&

                !reference.startsWith(
                    "VACC-"
                ) &&

                !reference.startsWith(
                    "MANUAL_WALLET_"
                )
            ) {

                await conn.rollback();

                return res.status(400).json({

                    success: false,

                    message:
                        "This is not a manual wallet funding payment."

                });

            }


            const adminId =
                getAdminId(req);


            const reason =
                String(
                    req.body?.reason ||
                    "Manual wallet funding rejected."
                ).trim();


            await conn.query(
                `
                UPDATE payments

                SET

                    status = 'rejected',

                    approved_by = ?,

                    approved_at = NOW(),

                    updated_at = NOW()

                WHERE

                    id = ?

                AND

                    LOWER(
                        COALESCE(
                            status,
                            ''
                        )
                    ) = 'pending'

                LIMIT 1
                `,
                [
                    adminId,

                    payment.id
                ]
            );


            await conn.query(
                `
                UPDATE wallet_transactions

                SET

                    status = 'rejected',

                    paystack_status = 'rejected',

                    updated_at = NOW()

                WHERE

                    user_id = ?

                AND

                    reference = ?

                AND

                    LOWER(
                        COALESCE(
                            status,
                            ''
                        )
                    ) = 'pending'
                `,
                [
                    payment.user_id,

                    payment.reference
                ]
            );


            await conn.query(
                `
                UPDATE account_payments

                SET

                    status = 'rejected',

                    paystack_status = 'rejected',

                    metadata =
                        JSON_SET(
                            COALESCE(
                                metadata,
                                JSON_OBJECT()
                            ),
                            '$.rejection_reason',
                            ?
                        ),

                    updated_at = NOW()

                WHERE

                    user_id = ?

                AND

                    reference = ?

                AND

                    LOWER(
                        COALESCE(
                            status,
                            ''
                        )
                    ) = 'pending'
                `,
                [
                    reason,

                    payment.user_id,

                    payment.reference
                ]
            );


            await conn.commit();


            return res.status(200).json({

                success: true,

                message:
                    "Manual wallet funding payment rejected successfully.",

                payment: {

                    id:
                        payment.id,

                    user_id:
                        payment.user_id,

                    amount:
                        numberValue(
                            payment.amount
                        ),

                    reference:
                        payment.reference,

                    status:
                        "rejected",

                    reason:
                        reason

                }

            });


        } catch (error) {

            try {

                await conn.rollback();

            } catch (_) {}


            console.error(
                "REJECT MANUAL WALLET PAYMENT ERROR:",
                error
            );


            return res.status(500).json({

                success: false,

                message:
                    error.sqlMessage ||
                    error.message ||
                    "Failed to reject manual wallet funding."

            });

        } finally {

            conn.release();

        }

    }
);


/* ==========================================================================
   ==========================================================================
   
      MANUAL REGISTRATION PAYMENT

   ==========================================================================
   ========================================================================== */


/*
|--------------------------------------------------------------------------
| 4. LOAD PENDING MANUAL REGISTRATION PAYMENTS
|--------------------------------------------------------------------------
|
| GET
| /api/admin/manual-payments
|
|--------------------------------------------------------------------------
*/

router.get(
    "/manual-payments",
    authenticate,
    requireAdmin,
    async (req, res) => {

        try {

            const [payments] =
                await pool.query(
                    `
                    SELECT

                        p.id,

                        p.user_id,

                        p.amount,

                        p.method,

                        p.reference,

                        p.status,

                        p.created_at,

                        u.full_name,

                        u.email,

                        u.phone_number

                    FROM payments p

                    INNER JOIN users u
                        ON u.id = p.user_id

                    WHERE

                        p.method = 'manual'

                    AND

                        p.reference LIKE 'REG_MANUAL_%'

                    AND

                        LOWER(
                            COALESCE(
                                p.status,
                                ''
                            )
                        ) = 'pending'

                    ORDER BY
                        p.created_at DESC
                    `
                );


            return res.status(200).json({

                success: true,

                count:
                    payments.length,

                payments:
                    payments.map(
                        payment => ({

                            id:
                                payment.id,

                            user_id:
                                payment.user_id,

                            full_name:
                                payment.full_name ||
                                "Unknown User",

                            email:
                                payment.email ||
                                "",

                            phone_number:
                                payment.phone_number ||
                                "",

                            amount:
                                numberValue(
                                    payment.amount
                                ),

                            payment_method:
                                "BANK_TRANSFER",

                            method:
                                payment.method,

                            reference:
                                payment.reference,

                            status:
                                payment.status,

                            created_at:
                                payment.created_at

                        })
                    )

            });


        } catch (error) {

            console.error(
                "LOAD MANUAL REGISTRATION PAYMENTS ERROR:",
                error
            );


            return res.status(500).json({

                success: false,

                message:
                    error.sqlMessage ||
                    error.message ||
                    "Unable to load registration payments."

            });

        }

    }
);


/*
|--------------------------------------------------------------------------
| 5. APPROVE MANUAL REGISTRATION PAYMENT
|--------------------------------------------------------------------------
|
| POST
| /api/admin/manual-payments/:id/approve
|
|--------------------------------------------------------------------------
*/

router.post(
    "/manual-payments/:id/approve",
    authenticate,
    requireAdmin,
    async (req, res) => {

        const paymentId =
            Number(
                req.params.id
            );


        if (
            !Number.isInteger(paymentId) ||
            paymentId <= 0
        ) {

            return res.status(400).json({

                success: false,

                message:
                    "Invalid payment ID."

            });

        }


        const conn =
            await pool.getConnection();


        try {

            await conn.beginTransaction();


            const [payments] =
                await conn.query(
                    `
                    SELECT *

                    FROM payments

                    WHERE

                        id = ?

                    AND

                        method = 'manual'

                    AND

                        reference LIKE 'REG_MANUAL_%'

                    AND

                        LOWER(
                            COALESCE(
                                status,
                                ''
                            )
                        ) = 'pending'

                    LIMIT 1

                    FOR UPDATE
                    `,
                    [
                        paymentId
                    ]
                );


            if (!payments.length) {

                await conn.rollback();

                return res.status(404).json({

                    success: false,

                    message:
                        "Pending registration payment was not found or has already been processed."

                });

            }


            const payment =
                payments[0];


            const [users] =
                await conn.query(
                    `
                    SELECT
                        id

                    FROM users

                    WHERE id = ?

                    LIMIT 1
                    `,
                    [
                        payment.user_id
                    ]
                );


            if (!users.length) {

                await conn.rollback();

                return res.status(404).json({

                    success: false,

                    message:
                        "User associated with this payment was not found."

                });

            }


            const adminId =
                getAdminId(req);


            await conn.query(
                `
                UPDATE payments

                SET

                    status = 'success',

                    approved_by = ?,

                    approved_at = NOW(),

                    updated_at = NOW()

                WHERE

                    id = ?

                AND

                    LOWER(
                        COALESCE(
                            status,
                            ''
                        )
                    ) = 'pending'

                LIMIT 1
                `,
                [
                    adminId,

                    paymentId
                ]
            );


            await conn.commit();


            let account = null;


            try {

                account =
                    await activateUser(
                        payment.user_id
                    );

            } catch (activationError) {

                console.error(
                    "ACTIVATE USER ERROR:",
                    activationError
                );


                return res.status(500).json({

                    success: false,

                    message:
                        "Payment was approved, but the user account could not be activated.",

                    error:
                        process.env.NODE_ENV ===
                        "development"
                            ? activationError.message
                            : undefined

                });

            }


            return res.status(200).json({

                success: true,

                message:
                    "Registration payment approved successfully. User account activated.",

                payment: {

                    id:
                        payment.id,

                    user_id:
                        payment.user_id,

                    amount:
                        numberValue(
                            payment.amount
                        ),

                    reference:
                        payment.reference,

                    status:
                        "success"

                },

                account:
                    account
                        ? {

                            id:
                                account.id,

                            accountno:
                                account.accountno,

                            account_name:
                                account.account_name,

                            status:
                                account.status,

                            balance:
                                numberValue(
                                    account.balance
                                )

                        }
                        : null

            });


        } catch (error) {

            try {

                await conn.rollback();

            } catch (_) {}


            console.error(
                "APPROVE MANUAL REGISTRATION PAYMENT ERROR:",
                error
            );


            return res.status(500).json({

                success: false,

                message:
                    error.sqlMessage ||
                    error.message ||
                    "Failed to approve registration payment."

            });

        } finally {

            conn.release();

        }

    }
);


/*
|--------------------------------------------------------------------------
| 6. REJECT MANUAL REGISTRATION PAYMENT
|--------------------------------------------------------------------------
|
| POST
| /api/admin/manual-payments/:id/reject
|
|--------------------------------------------------------------------------
*/

router.post(
    "/manual-payments/:id/reject",
    authenticate,
    requireAdmin,
    async (req, res) => {

        const paymentId =
            Number(
                req.params.id
            );


        if (
            !Number.isInteger(paymentId) ||
            paymentId <= 0
        ) {

            return res.status(400).json({

                success: false,

                message:
                    "Invalid payment ID."

            });

        }


        const conn =
            await pool.getConnection();


        try {

            await conn.beginTransaction();


            const [payments] =
                await conn.query(
                    `
                    SELECT

                        id,

                        user_id,

                        amount,

                        reference,

                        status

                    FROM payments

                    WHERE

                        id = ?

                    AND

                        method = 'manual'

                    AND

                        reference LIKE 'REG_MANUAL_%'

                    AND

                        LOWER(
                            COALESCE(
                                status,
                                ''
                            )
                        ) = 'pending'

                    LIMIT 1

                    FOR UPDATE
                    `,
                    [
                        paymentId
                    ]
                );


            if (!payments.length) {

                await conn.rollback();

                return res.status(404).json({

                    success: false,

                    message:
                        "Pending registration payment was not found or has already been processed."

                });

            }


            const adminId =
                getAdminId(req);


            await conn.query(
                `
                UPDATE payments

                SET

                    status = 'rejected',

                    approved_by = ?,

                    approved_at = NOW(),

                    updated_at = NOW()

                WHERE

                    id = ?

                AND

                    LOWER(
                        COALESCE(
                            status,
                            ''
                        )
                    ) = 'pending'

                LIMIT 1
                `,
                [
                    adminId,

                    paymentId
                ]
            );


            await conn.commit();


            return res.status(200).json({

                success: true,

                message:
                    "Registration payment rejected successfully."

            });


        } catch (error) {

            try {

                await conn.rollback();

            } catch (_) {}


            console.error(
                "REJECT MANUAL REGISTRATION PAYMENT ERROR:",
                error
            );


            return res.status(500).json({

                success: false,

                message:
                    error.sqlMessage ||
                    error.message ||
                    "Failed to reject registration payment."

            });

        } finally {

            conn.release();

        }

    }
);


/* ==========================================================================
   ==========================================================================
   
      THRIFT MANAGEMENT

   ==========================================================================
   ========================================================================== */


/*
|--------------------------------------------------------------------------
| 7. FIND DUE THRIFT
|--------------------------------------------------------------------------
|
| GET
| /api/admin/thrift/due
|
| A thrift is considered due/complete when:
|
| current_weeks >= 50
|
| AND
|
| amount_paid >= 75,000
|
| 1,500 x 50 = 75,000
|
|--------------------------------------------------------------------------
*/

router.get(
    "/thrift/due",
    authenticate,
    requireAdmin,
    async (req, res) => {

        try {

            const [rows] =
                await pool.query(
                    `
                    SELECT

                        ts.id,

                        ts.user_id,

                        ts.virtual_account_number,

                        ts.virtual_account_id,

                        ts.accountno,

                        ts.plans,

                        ts.amount,

                        ts.amount_paid,

                        ts.profit,

                        ts.current_weeks,

                        ts.fine_amount,

                        ts.start_date,

                        ts.end_date,

                        ts.plan_status,

                        ts.default_weeks,

                        ts.last_default_week,

                        ts.clearance_fee,

                        ts.clearance_status,

                        ts.clearance_accountno,

                        ts.clearance_paid_at,

                        ts.created_at,

                        ts.updated_at,

                        u.full_name,

                        u.email,

                        u.phone_number

                    FROM thrift_subscribe ts

                    LEFT JOIN users u
                        ON u.id = ts.user_id

                    WHERE

                        COALESCE(
                            ts.current_weeks,
                            0
                        ) >= ?

                    AND

                        COALESCE(
                            ts.amount_paid,
                            0
                        ) >= ?

                    ORDER BY

                        ts.end_date ASC,

                        ts.id ASC
                    `,
                    [
                        MAX_THRIFT_WEEKS,

                        TOTAL_THRIFT_CONTRIBUTION
                    ]
                );


            let totalAmountDue = 0;

            let totalAmountPaid = 0;

            let totalProfit = 0;


            rows.forEach(row => {

                totalAmountDue +=
                    numberValue(
                        row.amount
                    );

                totalAmountPaid +=
                    numberValue(
                        row.amount_paid
                    );

                totalProfit +=
                    numberValue(
                        row.profit
                    );

            });


            return res.status(200).json({

                success: true,

                count:
                    rows.length,

                weekly_amount:
                    WEEKLY_THRIFT_AMOUNT,

                required_weeks:
                    MAX_THRIFT_WEEKS,

                required_contribution:
                    TOTAL_THRIFT_CONTRIBUTION,

                total_amount_due:
                    totalAmountDue,

                total_amount_paid:
                    totalAmountPaid,

                total_profit:
                    totalProfit,

                thrift:
                    rows.map(row => ({

                        id:
                            row.id,

                        user_id:
                            row.user_id,

                        full_name:
                            row.full_name ||
                            "Unknown User",

                        email:
                            row.email ||
                            "",

                        phone_number:
                            row.phone_number ||
                            "",

                        virtual_account_number:
                            row.virtual_account_number,

                        virtual_account_id:
                            row.virtual_account_id,

                        accountno:
                            row.accountno,

                        plans:
                            row.plans,

                        amount:
                            numberValue(
                                row.amount
                            ),

                        amount_paid:
                            numberValue(
                                row.amount_paid
                            ),

                        profit:
                            numberValue(
                                row.profit
                            ),

                        current_weeks:
                            Number(
                                row.current_weeks || 0
                            ),

                        fine_amount:
                            numberValue(
                                row.fine_amount
                            ),

                        default_weeks:
                            Number(
                                row.default_weeks || 0
                            ),

                        last_default_week:
                            row.last_default_week,

                        start_date:
                            row.start_date,

                        end_date:
                            row.end_date,

                        plan_status:
                            row.plan_status,

                        clearance_fee:
                            numberValue(
                                row.clearance_fee
                            ),

                        clearance_status:
                            row.clearance_status,

                        clearance_accountno:
                            row.clearance_accountno,

                        clearance_paid_at:
                            row.clearance_paid_at,

                        created_at:
                            row.created_at,

                        updated_at:
                            row.updated_at

                    }))

            });

        } catch (error) {

            console.error(
                "ADMIN FIND DUE THRIFT ERROR:",
                error
            );


            return res.status(500).json({

                success: false,

                message:
                    error.sqlMessage ||
                    error.message ||
                    "Unable to find due thrift."

            });

        }

    }
);


/*
|--------------------------------------------------------------------------
| 8. FIND CLEARANCE
|--------------------------------------------------------------------------
|
| GET
| /api/admin/thrift/clearance
|
| A thrift is cleared when:
|
| clearance_status = paid
|
| AND
|
| clearance_fee >= 2,000
|
|--------------------------------------------------------------------------
*/

router.get(
    "/thrift/clearance",
    authenticate,
    requireAdmin,
    async (req, res) => {

        try {

            const [rows] =
                await pool.query(
                    `
                    SELECT

                        ts.id,

                        ts.user_id,

                        ts.virtual_account_number,

                        ts.virtual_account_id,

                        ts.accountno,

                        ts.plans,

                        ts.amount,

                        ts.amount_paid,

                        ts.profit,

                        ts.current_weeks,

                        ts.fine_amount,

                        ts.start_date,

                        ts.end_date,

                        ts.plan_status,

                        ts.default_weeks,

                        ts.last_default_week,

                        ts.clearance_fee,

                        ts.clearance_status,

                        ts.clearance_accountno,

                        ts.clearance_paid_at,

                        ts.created_at,

                        ts.updated_at,

                        u.full_name,

                        u.email,

                        u.phone_number

                    FROM thrift_subscribe ts

                    LEFT JOIN users u
                        ON u.id = ts.user_id

                    WHERE

                        LOWER(
                            COALESCE(
                                ts.clearance_status,
                                ''
                            )
                        ) = 'paid'

                    AND

                        COALESCE(
                            ts.clearance_fee,
                            0
                        ) >= ?

                    ORDER BY

                        ts.clearance_paid_at DESC,

                        ts.id DESC
                    `,
                    [
                        CLEARANCE_FEE
                    ]
                );


            let totalClearance =
                0;


            rows.forEach(row => {

                totalClearance +=
                    numberValue(
                        row.clearance_fee
                    );

            });


            return res.status(200).json({

                success: true,

                count:
                    rows.length,

                required_clearance_fee:
                    CLEARANCE_FEE,

                total_clearance_paid:
                    totalClearance,

                thrift:
                    rows.map(row => ({

                        id:
                            row.id,

                        user_id:
                            row.user_id,

                        full_name:
                            row.full_name ||
                            "Unknown User",

                        email:
                            row.email ||
                            "",

                        phone_number:
                            row.phone_number ||
                            "",

                        virtual_account_number:
                            row.virtual_account_number,

                        virtual_account_id:
                            row.virtual_account_id,

                        accountno:
                            row.accountno,

                        plans:
                            row.plans,

                        amount:
                            numberValue(
                                row.amount
                            ),

                        amount_paid:
                            numberValue(
                                row.amount_paid
                            ),

                        profit:
                            numberValue(
                                row.profit
                            ),

                        current_weeks:
                            Number(
                                row.current_weeks || 0
                            ),

                        fine_amount:
                            numberValue(
                                row.fine_amount
                            ),

                        default_weeks:
                            Number(
                                row.default_weeks || 0
                            ),

                        last_default_week:
                            row.last_default_week,

                        start_date:
                            row.start_date,

                        end_date:
                            row.end_date,

                        plan_status:
                            row.plan_status,

                        clearance_fee:
                            numberValue(
                                row.clearance_fee
                            ),

                        clearance_status:
                            row.clearance_status,

                        clearance_accountno:
                            row.clearance_accountno,

                        clearance_paid_at:
                            row.clearance_paid_at,

                        created_at:
                            row.created_at,

                        updated_at:
                            row.updated_at

                    }))

            });

        } catch (error) {

            console.error(
                "ADMIN FIND CLEARANCE ERROR:",
                error
            );


            return res.status(500).json({

                success: false,

                message:
                    error.sqlMessage ||
                    error.message ||
                    "Unable to find cleared thrift."

            });

        }

    }
);

/*
|--------------------------------------------------------------------------
| 9. FIND CURRENT THRIFT
|--------------------------------------------------------------------------
|
| GET
| /api/admin/thrift
|
| Shows thrift subscriptions that are currently active.
|
|--------------------------------------------------------------------------
*/

router.get(
    "/thrift",
    authenticate,
    requireAdmin,
    async (req, res) => {

        try {

            const [rows] =
                await pool.query(
                    `
                    SELECT

                        ts.id,

                        ts.user_id,

                        ts.virtual_account_id,

                        va.accountno,

                        va.account_name,

                        ts.plans,

                        ts.amount,

                        ts.amount_paid,

                        ts.profit,

                        ts.current_weeks,

                        ts.fine_amount,

                        ts.start_date,

                        ts.end_date,

                        ts.plan_status,

                        ts.default_weeks,

                        ts.last_default_week,

                        ts.clearance_fee,

                        ts.clearance_status,

                        ts.clearance_accountno,

                        ts.clearance_paid_at,

                        ts.created_at,

                        ts.updated_at

                    FROM thrift_subscribe ts

                    LEFT JOIN virtual_account va
                        ON va.id = ts.virtual_account_id

                    WHERE

                        LOWER(
                            COALESCE(
                                ts.plan_status,
                                ''
                            )
                        ) IN (
                            'active',
                            'subscribed',
                            'running',
                            'ongoing'
                        )

                    ORDER BY

                        ts.created_at DESC,

                        ts.id DESC
                    `
                );


            let totalAmountPaid = 0;

            let totalFine = 0;


            rows.forEach(row => {

                totalAmountPaid +=
                    numberValue(
                        row.amount_paid
                    );

                totalFine +=
                    numberValue(
                        row.fine_amount
                    );

            });


            return res.status(200).json({

                success: true,

                count:
                    rows.length,

                total_amount_paid:
                    totalAmountPaid,

                total_fine_amount:
                    totalFine,

                weekly_amount:
                    WEEKLY_THRIFT_AMOUNT,

                thrift:
                    rows.map(row => ({

                        id:
                            row.id,

                        user_id:
                            row.user_id,

                        virtual_account_id:
                            row.virtual_account_id,

                        accountno:
                            row.accountno ||
                            "",

                        account_name:
                            row.account_name ||
                            "",

                        plans:
                            row.plans,

                        amount:
                            numberValue(
                                row.amount
                            ),

                        amount_paid:
                            numberValue(
                                row.amount_paid
                            ),

                        profit:
                            numberValue(
                                row.profit
                            ),

                        current_weeks:
                            Number(
                                row.current_weeks || 0
                            ),

                        fine_amount:
                            numberValue(
                                row.fine_amount
                            ),

                        default_weeks:
                            Number(
                                row.default_weeks || 0
                            ),

                        last_default_week:
                            row.last_default_week,

                        start_date:
                            row.start_date,

                        end_date:
                            row.end_date,

                        plan_status:
                            row.plan_status,

                        clearance_fee:
                            numberValue(
                                row.clearance_fee
                            ),

                        clearance_status:
                            row.clearance_status,

                        clearance_accountno:
                            row.clearance_accountno,

                        clearance_paid_at:
                            row.clearance_paid_at,

                        created_at:
                            row.created_at,

                        updated_at:
                            row.updated_at

                    }))

            });

        } catch (error) {

            console.error(
                "ADMIN FIND THRIFT ERROR:",
                error
            );


            return res.status(500).json({

                success: false,

                message:
                    error.sqlMessage ||
                    error.message ||
                    "Unable to find thrift subscriptions."

            });

        }

    }
);



/* ==========================================================================
   ==========================================================================
   
      LIST ALL VIRTUAL ACCOUNTS

   ==========================================================================
   ========================================================================== */


/*
|--------------------------------------------------------------------------
| 10. LIST ALL ACCOUNTS
|--------------------------------------------------------------------------
|
| GET
| /api/admin/accounts
|
|--------------------------------------------------------------------------
*/

/* =====================================================
   LIST ALL VIRTUAL ACCOUNTS
   GET /api/admin/accounts
===================================================== */

router.get(
    "/accounts",
    authenticate,
    requireAdmin,
    async (req, res) => {

        try {

            const [accounts] = await pool.query(`
                SELECT
                    va.id,
                    va.user_id,
                    va.accountno,
                    va.account_name,
                    va.status,

                    COALESCE(
                        va.balance,
                        0
                    ) AS balance,

                    va.virtual_account_id,
                    va.thrift_week_paid,
                    va.thrift_total_paid,
                    va.thrift_last_deduction_date,
                    va.default_weeks,
                    va.created_at,

                    u.full_name,
                    u.first_name,
                    u.last_name,
                    u.email,
                    u.phone_number

                FROM virtual_account va

                LEFT JOIN users u
                    ON u.id = va.user_id

                ORDER BY
                    va.id DESC
            `);

            return res.json({
                success: true,
                count: accounts.length,
                accounts
            });

        } catch (error) {

            console.error(
                "LIST ACCOUNTS ERROR:",
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




/* ==========================================================================
   ==========================================================================
   
      DELETE VIRTUAL ACCOUNT

   ==========================================================================
   ========================================================================== */


/*
|--------------------------------------------------------------------------
| 11. DELETE VIRTUAL ACCOUNT
|--------------------------------------------------------------------------
|
| DELETE
| /api/admin/accounts/:id
|
| The account is protected from deletion if it has:
|
| - wallet transactions
| - thrift subscriptions
| - account payments
| - payments
|
|--------------------------------------------------------------------------
*/

router.delete(
    "/accounts/:id",
    authenticate,
    requireAdmin,
    async (req, res) => {

        const accountId =
            Number(
                req.params.id
            );


        if (
            !Number.isInteger(accountId) ||
            accountId <= 0
        ) {

            return res.status(400).json({

                success: false,

                message:
                    "Invalid virtual account ID."

            });

        }


        const conn =
            await pool.getConnection();


        try {

            await conn.beginTransaction();


            /*
            |--------------------------------------------------------------------------
            | LOCK ACCOUNT
            |--------------------------------------------------------------------------
            */

            const [accounts] =
                await conn.query(
                    `
                    SELECT

                        id,

                        user_id,

                        accountno,

                        account_name,

                        balance

                    FROM virtual_account

                    WHERE id = ?

                    LIMIT 1

                    FOR UPDATE
                    `,
                    [
                        accountId
                    ]
                );


            if (!accounts.length) {

                await conn.rollback();

                return res.status(404).json({

                    success: false,

                    message:
                        "Virtual account was not found."

                });

            }


            const account =
                accounts[0];


            /*
            |--------------------------------------------------------------------------
            | CHECK WALLET TRANSACTIONS
            |--------------------------------------------------------------------------
            */

            const [walletRows] =
                await conn.query(
                    `
                    SELECT
                        COUNT(*) AS total

                    FROM wallet_transactions

                    WHERE

                        user_id = ?

                    AND

                        accountno = ?
                    `,
                    [
                        account.user_id,

                        account.accountno
                    ]
                );


            if (
                Number(
                    walletRows[0]?.total || 0
                ) > 0
            ) {

                await conn.rollback();

                return res.status(409).json({

                    success: false,

                    message:
                        "This virtual account cannot be deleted because it has wallet transactions. Delete the related transactions first."

                });

            }


            /*
            |--------------------------------------------------------------------------
            | CHECK THRIFT
            |--------------------------------------------------------------------------
            */

            const [thriftRows] =
                await conn.query(
                    `
                    SELECT
                        COUNT(*) AS total

                    FROM thrift_subscribe

                    WHERE

                        (
                            virtual_account_id = ?

                            OR

                            accountno = ?

                            OR

                            virtual_account_number = ?
                        )
                    `,
                    [
                        account.id,

                        account.accountno,

                        account.accountno
                    ]
                );


            if (
                Number(
                    thriftRows[0]?.total || 0
                ) > 0
            ) {

                await conn.rollback();

                return res.status(409).json({

                    success: false,

                    message:
                        "This virtual account cannot be deleted because it has thrift subscription records."

                });

            }


            /*
            |--------------------------------------------------------------------------
            | CHECK ACCOUNT PAYMENTS
            |--------------------------------------------------------------------------
            */

            const [accountPaymentRows] =
                await conn.query(
                    `
                    SELECT
                        COUNT(*) AS total

                    FROM account_payments

                    WHERE

                        virtual_account_id = ?
                    `,
                    [
                        account.id
                    ]
                );


            if (
                Number(
                    accountPaymentRows[0]?.total || 0
                ) > 0
            ) {

                await conn.rollback();

                return res.status(409).json({

                    success: false,

                    message:
                        "This virtual account cannot be deleted because it has account payment records."

                });

            }


            /*
            |--------------------------------------------------------------------------
            | CHECK PAYMENTS
            |--------------------------------------------------------------------------
            */

            const [paymentRows] =
                await conn.query(
                    `
                    SELECT
                        COUNT(*) AS total

                    FROM payments

                    WHERE

                        virtual_account_id = ?
                    `,
                    [
                        account.id
                    ]
                );


            if (
                Number(
                    paymentRows[0]?.total || 0
                ) > 0
            ) {

                await conn.rollback();

                return res.status(409).json({

                    success: false,

                    message:
                        "This virtual account cannot be deleted because it has payment records."

                });

            }


            /*
            |--------------------------------------------------------------------------
            | DELETE
            |--------------------------------------------------------------------------
            */

            await conn.query(
                `
                DELETE FROM virtual_account

                WHERE id = ?

                LIMIT 1
                `,
                [
                    accountId
                ]
            );


            await conn.commit();


            return res.status(200).json({

                success: true,

                message:
                    "Virtual account deleted successfully.",

                account: {

                    id:
                        account.id,

                    accountno:
                        account.accountno,

                    account_name:
                        account.account_name

                }

            });


        } catch (error) {

            try {

                await conn.rollback();

            } catch (_) {}


            console.error(
                "ADMIN DELETE ACCOUNT ERROR:",
                error
            );


            return res.status(500).json({

                success: false,

                message:
                    error.sqlMessage ||
                    error.message ||
                    "Unable to delete virtual account."

            });

        } finally {

            conn.release();

        }

    }
);


/* ==========================================================================
   ==========================================================================
   
      LIST ALL WALLET TRANSACTIONS

   ==========================================================================
   ========================================================================== */


/*
|--------------------------------------------------------------------------
| 12. LIST ALL TRANSACTIONS
|--------------------------------------------------------------------------
|
| GET
| /api/admin/transactions
|
| Shows every record in wallet_transactions.
|
|--------------------------------------------------------------------------
*/

router.get(
    "/transactions",
    authenticate,
    requireAdmin,
    async (req, res) => {

        try {

            const [transactions] =
                await pool.query(
                    `
                    SELECT

                        wt.*,

                        u.full_name,

                        u.email,

                        u.phone_number,

                        va.account_name

                    FROM wallet_transactions wt

                    LEFT JOIN users u
                        ON u.id = wt.user_id

                    LEFT JOIN virtual_account va
                        ON va.accountno = wt.accountno

                    ORDER BY

                        wt.id DESC
                    `
                );


            let totalAmount = 0;


            transactions.forEach(
                transaction => {

                    totalAmount +=
                        numberValue(
                            transaction.amount
                        );

                }
            );


            return res.status(200).json({

                success: true,

                count:
                    transactions.length,

                total_amount:
                    totalAmount,

                transactions:
                    transactions

            });

        } catch (error) {

            console.error(
                "ADMIN LIST ALL TRANSACTIONS ERROR:",
                error
            );


            return res.status(500).json({

                success: false,

                message:
                    error.sqlMessage ||
                    error.message ||
                    "Unable to load wallet transactions."

            });

        }

    }
);


/*
|--------------------------------------------------------------------------
| 13. DELETE WALLET TRANSACTION
|--------------------------------------------------------------------------
|
| DELETE
| /api/admin/transactions/:id
|
|--------------------------------------------------------------------------
*/

router.delete(
    "/transactions/:id",
    authenticate,
    requireAdmin,
    async (req, res) => {

        const transactionId =
            Number(
                req.params.id
            );


        if (
            !Number.isInteger(transactionId) ||
            transactionId <= 0
        ) {

            return res.status(400).json({

                success: false,

                message:
                    "Invalid transaction ID."

            });

        }


        const conn =
            await pool.getConnection();


        try {

            await conn.beginTransaction();


            const [transactions] =
                await conn.query(
                    `
                    SELECT *

                    FROM wallet_transactions

                    WHERE id = ?

                    LIMIT 1

                    FOR UPDATE
                    `,
                    [
                        transactionId
                    ]
                );


            if (!transactions.length) {

                await conn.rollback();

                return res.status(404).json({

                    success: false,

                    message:
                        "Wallet transaction was not found."

                });

            }


            const transaction =
                transactions[0];


            /*
            |--------------------------------------------------------------------------
            | DELETE
            |--------------------------------------------------------------------------
            */

            await conn.query(
                `
                DELETE FROM wallet_transactions

                WHERE id = ?

                LIMIT 1
                `,
                [
                    transactionId
                ]
            );


            await conn.commit();


            return res.status(200).json({

                success: true,

                message:
                    "Wallet transaction deleted successfully.",

                transaction: {

                    id:
                        transaction.id,

                    reference:
                        transaction.reference,

                    amount:
                        numberValue(
                            transaction.amount
                        )

                }

            });


        } catch (error) {

            try {

                await conn.rollback();

            } catch (_) {}


            console.error(
                "ADMIN DELETE WALLET TRANSACTION ERROR:",
                error
            );


            return res.status(500).json({

                success: false,

                message:
                    error.sqlMessage ||
                    error.message ||
                    "Unable to delete wallet transaction."

            });

        } finally {

            conn.release();

        }

    }
);


/* ==========================================================================
   ==========================================================================
   
      LIST ALL WALLET ACTIVITY CONNECTED TO VIRTUAL ACCOUNTS

   ==========================================================================
   ========================================================================== */


/*
|--------------------------------------------------------------------------
| 14. LIST ALL WALLET
|--------------------------------------------------------------------------
|
| GET
| /api/admin/wallet
|
| This shows wallet_transactions joined to virtual_account and users.
|
|--------------------------------------------------------------------------
*/

router.get(
    "/wallet",
    authenticate,
    requireAdmin,
    async (req, res) => {

        try {

            const [transactions] =
                await pool.query(
                    `
                    SELECT

                        wt.*,

                        u.full_name,

                        u.email,

                        u.phone_number,

                        va.id AS virtual_account_id,

                        va.accountno AS virtual_account_no,

                        va.account_name,

                        COALESCE(
                            va.balance,
                            0
                        ) AS current_account_balance,

                        va.status AS account_status

                    FROM wallet_transactions wt

                    INNER JOIN virtual_account va

                        ON va.accountno =
                           wt.accountno

                    LEFT JOIN users u

                        ON u.id =
                           wt.user_id

                    ORDER BY

                        wt.id DESC
                    `
                );


            let totalAmount = 0;


            transactions.forEach(
                transaction => {

                    totalAmount +=
                        numberValue(
                            transaction.amount
                        );

                }
            );


            return res.status(200).json({

                success: true,

                count:
                    transactions.length,

                total_amount:
                    totalAmount,

                wallet:
                    transactions.map(
                        transaction => ({

                            id:
                                transaction.id,

                            user_id:
                                transaction.user_id,

                            full_name:
                                transaction.full_name ||
                                "Unknown User",

                            email:
                                transaction.email ||
                                "",

                            phone_number:
                                transaction.phone_number ||
                                "",

                            virtual_account_id:
                                transaction.virtual_account_id,

                            accountno:
                                transaction.virtual_account_no,

                            account_name:
                                transaction.account_name,

                            account_status:
                                transaction.account_status,

                            current_account_balance:
                                numberValue(
                                    transaction.current_account_balance
                                ),

                            amount:
                                numberValue(
                                    transaction.amount
                                ),

                            reference:
                                transaction.reference,

                            status:
                                transaction.status,

                            payment_method:
                                transaction.payment_method,

                            paystack_status:
                                transaction.paystack_status,

                            paid_at:
                                transaction.paid_at,

                            created_at:
                                transaction.created_at,

                            updated_at:
                                transaction.updated_at

                        })
                    )

            });

        } catch (error) {

            console.error(
                "ADMIN LIST ALL WALLET ERROR:",
                error
            );


            return res.status(500).json({

                success: false,

                message:
                    error.sqlMessage ||
                    error.message ||
                    "Unable to load wallet activity."

            });

        }

    }
);


/*
|--------------------------------------------------------------------------
| 15. DELETE WALLET TRANSACTION
|--------------------------------------------------------------------------
|
| The same wallet_transactions record can also be deleted from the
| "List All Wallet" interface.
|
| DELETE
| /api/admin/wallet/:id
|
|--------------------------------------------------------------------------
*/

router.delete(
    "/wallet/:id",
    authenticate,
    requireAdmin,
    async (req, res) => {

        const transactionId =
            Number(
                req.params.id
            );


        if (
            !Number.isInteger(transactionId) ||
            transactionId <= 0
        ) {

            return res.status(400).json({

                success: false,

                message:
                    "Invalid wallet transaction ID."

            });

        }


        try {

            const [transactions] =
                await pool.query(
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

                    LIMIT 1
                    `,
                    [
                        transactionId
                    ]
                );


            if (!transactions.length) {

                return res.status(404).json({

                    success: false,

                    message:
                        "Wallet transaction was not found."

                });

            }


            const transaction =
                transactions[0];


            const [result] =
                await pool.query(
                    `
                    DELETE FROM wallet_transactions

                    WHERE id = ?

                    LIMIT 1
                    `,
                    [
                        transactionId
                    ]
                );


            if (
                result.affectedRows !== 1
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Wallet transaction could not be deleted."

                });

            }


            return res.status(200).json({

                success: true,

                message:
                    "Wallet transaction deleted successfully.",

                transaction: {

                    id:
                        transaction.id,

                    user_id:
                        transaction.user_id,

                    accountno:
                        transaction.accountno,

                    amount:
                        numberValue(
                            transaction.amount
                        ),

                    reference:
                        transaction.reference,

                    status:
                        transaction.status

                }

            });

        } catch (error) {

            console.error(
                "ADMIN DELETE WALLET ERROR:",
                error
            );


            return res.status(500).json({

                success: false,

                message:
                    error.sqlMessage ||
                    error.message ||
                    "Unable to delete wallet transaction."

            });

        }

    }
);


/* ==========================================================================
   ==========================================================================
   
      FIND USERS

   ==========================================================================
   ========================================================================== */


/*
|--------------------------------------------------------------------------
| 16. LIST ALL USERS
|--------------------------------------------------------------------------
|
| GET
| /api/admin/users
|
|--------------------------------------------------------------------------
*/

router.get(
    "/users",
    authenticate,
    requireAdmin,
    async (req, res) => {

        try {

            const [users] =
                await pool.query(
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

                        u.updated_at,

                        COUNT(
                            DISTINCT va.id
                        ) AS account_count

                    FROM users u

                    LEFT JOIN virtual_account va

                        ON va.user_id =
                           u.id

                    GROUP BY

                        u.id,

                        u.full_name,

                        u.email,

                        u.phone_number,

                        u.gender,

                        u.referral,

                        u.payment_status,

                        u.account_status,

                        u.created_at,

                        u.updated_at

                    ORDER BY

                        u.id DESC
                    `
                );


            return res.status(200).json({

                success: true,

                count:
                    users.length,

                users:
                    users.map(
                        user => ({

                            id:
                                user.id,

                            full_name:
                                user.full_name ||
                                "Unknown User",

                            email:
                                user.email ||
                                "",

                            phone_number:
                                user.phone_number ||
                                "",

                            gender:
                                user.gender,

                            referral:
                                user.referral,

                            payment_status:
                                user.payment_status,

                            account_status:
                                user.account_status,

                            account_count:
                                Number(
                                    user.account_count ||
                                    0
                                ),

                            created_at:
                                user.created_at,

                            updated_at:
                                user.updated_at

                        })
                    )

            });

        } catch (error) {

            console.error(
                "ADMIN FIND USERS ERROR:",
                error
            );


            return res.status(500).json({

                success: false,

                message:
                    error.sqlMessage ||
                    error.message ||
                    "Unable to load users."

            });

        }

    }
);


/* ==========================================================================
   ==========================================================================
   
      DELETE USER

   ==========================================================================
   ========================================================================== */


/*
|--------------------------------------------------------------------------
| 17. DELETE USER
|--------------------------------------------------------------------------
|
| DELETE
| /api/admin/users/:id
|
| This route protects records that belong to the user.
|
|--------------------------------------------------------------------------
*/

router.delete(
    "/users/:id",
    authenticate,
    requireAdmin,
    async (req, res) => {

        const userId =
            Number(
                req.params.id
            );


        if (
            !Number.isInteger(userId) ||
            userId <= 0
        ) {

            return res.status(400).json({

                success: false,

                message:
                    "Invalid user ID."

            });

        }


        const conn =
            await pool.getConnection();


        try {

            await conn.beginTransaction();


            /*
            |--------------------------------------------------------------------------
            | LOCK USER
            |--------------------------------------------------------------------------
            */

            const [users] =
                await conn.query(
                    `
                    SELECT

                        id,

                        full_name,

                        email,

                        phone_number

                    FROM users

                    WHERE id = ?

                    LIMIT 1

                    FOR UPDATE
                    `,
                    [
                        userId
                    ]
                );


            if (!users.length) {

                await conn.rollback();

                return res.status(404).json({

                    success: false,

                    message:
                        "User was not found."

                });

            }


            const user =
                users[0];


            /*
            |--------------------------------------------------------------------------
            | CHECK VIRTUAL ACCOUNTS
            |--------------------------------------------------------------------------
            */

            const [accountRows] =
                await conn.query(
                    `
                    SELECT
                        COUNT(*) AS total

                    FROM virtual_account

                    WHERE user_id = ?
                    `,
                    [
                        userId
                    ]
                );


            if (
                Number(
                    accountRows[0]?.total || 0
                ) > 0
            ) {

                await conn.rollback();

                return res.status(409).json({

                    success: false,

                    message:
                        "This user cannot be deleted because the user has virtual accounts. Delete the user's virtual accounts first."

                });

            }


            /*
            |--------------------------------------------------------------------------
            | CHECK THRIFT
            |--------------------------------------------------------------------------
            */

            const [thriftRows] =
                await conn.query(
                    `
                    SELECT
                        COUNT(*) AS total

                    FROM thrift_subscribe

                    WHERE user_id = ?
                    `,
                    [
                        userId
                    ]
                );


            if (
                Number(
                    thriftRows[0]?.total || 0
                ) > 0
            ) {

                await conn.rollback();

                return res.status(409).json({

                    success: false,

                    message:
                        "This user cannot be deleted because the user has thrift subscription records."

                });

            }


            /*
            |--------------------------------------------------------------------------
            | CHECK WALLET TRANSACTIONS
            |--------------------------------------------------------------------------
            */

            const [walletRows] =
                await conn.query(
                    `
                    SELECT
                        COUNT(*) AS total

                    FROM wallet_transactions

                    WHERE user_id = ?
                    `,
                    [
                        userId
                    ]
                );


            if (
                Number(
                    walletRows[0]?.total || 0
                ) > 0
            ) {

                await conn.rollback();

                return res.status(409).json({

                    success: false,

                    message:
                        "This user cannot be deleted because the user has wallet transactions."

                });

            }


            /*
            |--------------------------------------------------------------------------
            | CHECK PAYMENTS
            |--------------------------------------------------------------------------
            */

            const [paymentRows] =
                await conn.query(
                    `
                    SELECT
                        COUNT(*) AS total

                    FROM payments

                    WHERE user_id = ?
                    `,
                    [
                        userId
                    ]
                );


            if (
                Number(
                    paymentRows[0]?.total || 0
                ) > 0
            ) {

                await conn.rollback();

                return res.status(409).json({

                    success: false,

                    message:
                        "This user cannot be deleted because the user has payment records."

                });

            }


            /*
            |--------------------------------------------------------------------------
            | CHECK ACCOUNT PAYMENTS
            |--------------------------------------------------------------------------
            */

            const [accountPaymentRows] =
                await conn.query(
                    `
                    SELECT
                        COUNT(*) AS total

                    FROM account_payments

                    WHERE user_id = ?
                    `,
                    [
                        userId
                    ]
                );


            if (
                Number(
                    accountPaymentRows[0]?.total || 0
                ) > 0
            ) {

                await conn.rollback();

                return res.status(409).json({

                    success: false,

                    message:
                        "This user cannot be deleted because the user has account payment records."

                });

            }


            /*
            |--------------------------------------------------------------------------
            | DELETE USER
            |--------------------------------------------------------------------------
            */

            await conn.query(
                `
                DELETE FROM users

                WHERE id = ?

                LIMIT 1
                `,
                [
                    userId
                ]
            );


            await conn.commit();


            return res.status(200).json({

                success: true,

                message:
                    "User deleted successfully.",

                user: {

                    id:
                        user.id,

                    full_name:
                        user.full_name,

                    email:
                        user.email,

                    phone_number:
                        user.phone_number

                }

            });


        } catch (error) {

            try {

                await conn.rollback();

            } catch (_) {}


            console.error(
                "ADMIN DELETE USER ERROR:",
                error
            );


            return res.status(500).json({

                success: false,

                message:
                    error.sqlMessage ||
                    error.message ||
                    "Unable to delete user."

            });

        } finally {

            conn.release();

        }

    }
);


/* ==========================================================================
   ==========================================================================
   
      ADMIN SUMMARY

   ==========================================================================
   ========================================================================== */


/*
|--------------------------------------------------------------------------
| 18. ADMIN SUMMARY
|--------------------------------------------------------------------------
|
| GET
| /api/admin/summary
|
| Optional endpoint for displaying counts on the admin dashboard.
|
|--------------------------------------------------------------------------
*/

router.get(
    "/summary",
    authenticate,
    requireAdmin,
    async (req, res) => {

        try {

            const [
                [
                    userCount
                ]
            ] =
                await pool.query(
                    `
                    SELECT
                        COUNT(*) AS total

                    FROM users
                    `
                );


            const [
                [
                    accountCount
                ]
            ] =
                await pool.query(
                    `
                    SELECT
                        COUNT(*) AS total

                    FROM virtual_account
                    `
                );


            const [
                [
                    thriftCount
                ]
            ] =
                await pool.query(
                    `
                    SELECT
                        COUNT(*) AS total

                    FROM thrift_subscribe

                    WHERE

                        LOWER(
                            COALESCE(
                                plan_status,
                                ''
                            )
                        ) IN (
                            'active',
                            'subscribed',
                            'running',
                            'ongoing'
                        )
                    `
                );


            const [
                [
                    dueCount
                ]
            ] =
                await pool.query(
                    `
                    SELECT
                        COUNT(*) AS total

                    FROM thrift_subscribe

                    WHERE

                        COALESCE(
                            current_weeks,
                            0
                        ) >= ?

                    AND

                        COALESCE(
                            amount_paid,
                            0
                        ) >= ?
                    `,
                    [
                        MAX_THRIFT_WEEKS,

                        TOTAL_THRIFT_CONTRIBUTION
                    ]
                );


            const [
                [
                    clearanceCount
                ]
            ] =
                await pool.query(
                    `
                    SELECT
                        COUNT(*) AS total

                    FROM thrift_subscribe

                    WHERE

                        LOWER(
                            COALESCE(
                                clearance_status,
                                ''
                            )
                        ) = 'paid'

                    AND

                        COALESCE(
                            clearance_fee,
                            0
                        ) >= ?
                    `,
                    [
                        CLEARANCE_FEE
                    ]
                );


            const [
                [
                    transactionCount
                ]
            ] =
                await pool.query(
                    `
                    SELECT
                        COUNT(*) AS total

                    FROM wallet_transactions
                    `
                );


            return res.status(200).json({

                success: true,

                summary: {

                    users:
                        Number(
                            userCount.total || 0
                        ),

                    accounts:
                        Number(
                            accountCount.total || 0
                        ),

                    thrift:
                        Number(
                            thriftCount.total || 0
                        ),

                    due_thrift:
                        Number(
                            dueCount.total || 0
                        ),

                    cleared_thrift:
                        Number(
                            clearanceCount.total || 0
                        ),

                    transactions:
                        Number(
                            transactionCount.total || 0
                        )

                }

            });

        } catch (error) {

            console.error(
                "ADMIN SUMMARY ERROR:",
                error
            );


            return res.status(500).json({

                success: false,

                message:
                    error.sqlMessage ||
                    error.message ||
                    "Unable to load admin summary."

            });

        }

    }
);






/*
|--------------------------------------------------------------------------
| ADMIN CASH REMOVED FROM VIRTUAL ACCOUNT
|--------------------------------------------------------------------------
|
| POST
| /api/admin/accounts/cash-removed
|
| Request body:
|
| {
|     "accountId": 12,
|     "accountNo": "1234567890",
|     "amount": 5000
| }
|
| The account number is used to identify the virtual account.
|
| The database balance is NEVER trusted from the browser.
|
| The actual balance is retrieved from the database and locked
| using SELECT ... FOR UPDATE before the deduction.
|
|--------------------------------------------------------------------------
*/


router.post(
    "/accounts/cash-removed",
    authenticate,
    requireAdmin,
    async (req, res) => {

        let connection;

        try {

            /*
            |--------------------------------------------------------------------------
            | READ REQUEST DATA
            |--------------------------------------------------------------------------
            */

            const {
                accountId,
                accountNo,
                amount
            } = req.body || {};


            /*
            |--------------------------------------------------------------------------
            | VALIDATE ACCOUNT NUMBER
            |--------------------------------------------------------------------------
            */

            if (
                accountNo === undefined ||
                accountNo === null ||
                String(accountNo).trim() === ""
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Virtual account number is required."

                });

            }


            const cleanAccountNo =
                String(accountNo).trim();


            /*
            |--------------------------------------------------------------------------
            | VALIDATE ACCOUNT ID
            |--------------------------------------------------------------------------
            |
            | accountId is also accepted from the frontend so that the request
            | corresponds to the selected row.
            |
            | The account number remains the primary lookup value.
            |
            |--------------------------------------------------------------------------
            */

            let cleanAccountId = null;


            if (
                accountId !== undefined &&
                accountId !== null &&
                String(accountId).trim() !== ""
            ) {

                cleanAccountId =
                    Number(accountId);


                if (
                    !Number.isInteger(
                        cleanAccountId
                    ) ||
                    cleanAccountId <= 0
                ) {

                    return res.status(400).json({

                        success: false,

                        message:
                            "Invalid virtual account ID."

                    });

                }

            }


            /*
            |--------------------------------------------------------------------------
            | VALIDATE AMOUNT
            |--------------------------------------------------------------------------
            */

            if (
                amount === undefined ||
                amount === null ||
                String(amount).trim() === ""
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Cash-Removed amount is required."

                });

            }


            const removeAmount =
                Number(amount);


            if (
                !Number.isFinite(
                    removeAmount
                ) ||
                removeAmount <= 0
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Cash-Removed amount must be greater than zero."

                });

            }


            /*
            |--------------------------------------------------------------------------
            | MONEY PRECISION
            |--------------------------------------------------------------------------
            |
            | Keep money calculations to two decimal places.
            |
            |--------------------------------------------------------------------------
            */

            const amountToRemove =
                Math.round(
                    (
                        removeAmount +
                        Number.EPSILON
                    ) * 100
                ) / 100;


            /*
            |--------------------------------------------------------------------------
            | DATABASE CONNECTION
            |--------------------------------------------------------------------------
            */

            connection =
                await pool.getConnection();


            /*
            |--------------------------------------------------------------------------
            | START TRANSACTION
            |--------------------------------------------------------------------------
            */

            await connection.beginTransaction();


            /*
            |--------------------------------------------------------------------------
            | FIND AND LOCK VIRTUAL ACCOUNT
            |--------------------------------------------------------------------------
            |
            | FOR UPDATE prevents another transaction from changing the
            | account balance while this cash-removal operation is running.
            |
            |--------------------------------------------------------------------------
            */

            let accountRows;


            if (cleanAccountId) {

                [
                    accountRows
                ] = await connection.execute(

                    `
                    SELECT
                        id,
                        user_id,
                        accountno,
                        account_name,
                        balance,
                        status
                    FROM virtual_account
                    WHERE id = ?
                      AND accountno = ?
                    LIMIT 1
                    FOR UPDATE
                    `,

                    [
                        cleanAccountId,
                        cleanAccountNo
                    ]

                );

            } else {

                [
                    accountRows
                ] = await connection.execute(

                    `
                    SELECT
                        id,
                        user_id,
                        accountno,
                        account_name,
                        balance,
                        status
                    FROM virtual_account
                    WHERE accountno = ?
                    LIMIT 1
                    FOR UPDATE
                    `,

                    [
                        cleanAccountNo
                    ]

                );

            }


            /*
            |--------------------------------------------------------------------------
            | ACCOUNT NOT FOUND
            |--------------------------------------------------------------------------
            */

            if (
                !accountRows ||
                accountRows.length === 0
            ) {

                await connection.rollback();

                return res.status(404).json({

                    success: false,

                    message:
                        "Virtual account not found."

                });

            }


            const account =
                accountRows[0];


            /*
            |--------------------------------------------------------------------------
            | CHECK ACCOUNT STATUS
            |--------------------------------------------------------------------------
            */

            if (
                account.status &&
                String(
                    account.status
                ).toLowerCase() !== "active"
            ) {

                await connection.rollback();

                return res.status(400).json({

                    success: false,

                    message:
                        "This virtual account is not active."

                });

            }


            /*
            |--------------------------------------------------------------------------
            | READ ACTUAL DATABASE BALANCE
            |--------------------------------------------------------------------------
            */

            const currentBalance =
                Number(
                    account.balance || 0
                );


            /*
            |--------------------------------------------------------------------------
            | PROTECT AGAINST INVALID DATABASE BALANCE
            |--------------------------------------------------------------------------
            */

            if (
                !Number.isFinite(
                    currentBalance
                ) ||
                currentBalance < 0
            ) {

                await connection.rollback();

                return res.status(500).json({

                    success: false,

                    message:
                        "The virtual account has an invalid balance."

                });

            }


            /*
            |--------------------------------------------------------------------------
            | CHECK SUFFICIENT BALANCE
            |--------------------------------------------------------------------------
            */

            if (
                currentBalance <
                amountToRemove
            ) {

                await connection.rollback();

                return res.status(400).json({

                    success: false,

                    message:
                        "Insufficient virtual account balance.",

                    account: {

                        id:
                            account.id,

                        accountno:
                            account.accountno,

                        balance:
                            currentBalance

                    },

                    requested_amount:
                        amountToRemove,

                    available_balance:
                        currentBalance

                });

            }


            /*
            |--------------------------------------------------------------------------
            | CALCULATE NEW BALANCE
            |--------------------------------------------------------------------------
            */

            const newBalance =
                Math.round(
                    (
                        currentBalance -
                        amountToRemove +
                        Number.EPSILON
                    ) * 100
                ) / 100;


            /*
            |--------------------------------------------------------------------------
            | FINAL SAFETY CHECK
            |--------------------------------------------------------------------------
            */

            if (
                newBalance < 0
            ) {

                await connection.rollback();

                return res.status(400).json({

                    success: false,

                    message:
                        "Cash removal would result in a negative balance."

                });

            }


            /*
            |--------------------------------------------------------------------------
            | DEDUCT CASH
            |--------------------------------------------------------------------------
            */

            await connection.execute(

                `
                UPDATE virtual_account
                SET balance = ?
                WHERE id = ?
                  AND accountno = ?
                `,

                [
                    newBalance,
                    account.id,
                    account.accountno
                ]

            );


            /*
            |--------------------------------------------------------------------------
            | COMMIT TRANSACTION
            |--------------------------------------------------------------------------
            */

            await connection.commit();


            /*
            |--------------------------------------------------------------------------
            | RELEASE CONNECTION
            |--------------------------------------------------------------------------
            */

            connection.release();

            connection = null;


            /*
            |--------------------------------------------------------------------------
            | SUCCESS RESPONSE
            |--------------------------------------------------------------------------
            */

            return res.status(200).json({

                success: true,

                message:
                    "Cash removed successfully from the virtual account.",

                transaction: {

                    type:
                        "CASH_REMOVED",

                    account_id:
                        account.id,

                    user_id:
                        account.user_id,

                    accountno:
                        account.accountno,

                    account_name:
                        account.account_name,

                    amount_removed:
                        amountToRemove,

                    previous_balance:
                        currentBalance,

                    new_balance:
                        newBalance

                }

            });


        } catch (error) {


            /*
            |--------------------------------------------------------------------------
            | ROLLBACK ON ERROR
            |--------------------------------------------------------------------------
            */

            if (connection) {

                try {

                    await connection.rollback();

                } catch (
                    rollbackError
                ) {

                    console.error(
                        "CASH REMOVED ROLLBACK ERROR:",
                        rollbackError
                    );

                }

            }


            console.error(
                "CASH REMOVED ERROR:",
                error
            );


            /*
            |--------------------------------------------------------------------------
            | RELEASE CONNECTION
            |--------------------------------------------------------------------------
            */

            if (connection) {

                try {

                    connection.release();

                } catch (
                    releaseError
                ) {

                    console.error(
                        "CASH REMOVED CONNECTION RELEASE ERROR:",
                        releaseError
                    );

                }

            }


            /*
            |--------------------------------------------------------------------------
            | SERVER ERROR
            |--------------------------------------------------------------------------
            */

            return res.status(500).json({

                success: false,

                message:
                    "Unable to remove cash from the virtual account."

            });

        }

    }
);



/* ==========================================================================
   ==========================================================================
   
      EXPORT

   ==========================================================================
   ========================================================================== */

module.exports = router;