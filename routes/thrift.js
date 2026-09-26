const express = require("express");
const router = express.Router();

const pool = require("../config/db");
const { authenticate, requireAdmin } = require("../middleware/auth");

/* =====================================================
   THRIFT CONSTANTS
===================================================== */

const WEEKLY_AMOUNT = 1500;
const FINE_AMOUNT = 1500;
const MAX_WEEKS = 50;



/* =====================================================
   GET LOGGED-IN USER ID
===================================================== */

function getLoggedInUserId(req) {

    return (
        req.user?.user_id ||
        req.user?.id ||
        req.user?.userId ||
        null
    );
}






/* =====================================================
   CREATE THRIFT SUBSCRIPTION
   -----------------------------------------------------
   RULES:

   1. User can select ANY of their virtual accounts
      from the thrift subscription dropdown.

   2. The selected virtual account is stored against
      the thrift subscription.

   3. The ₦1,500 subscription fee is ALWAYS deducted
      from the user's FIRST virtual account.

   4. The selected account is NOT debited for the
      subscription fee.

   5. The selected account becomes the account attached
      to the thrift subscription and is used for the
      subsequent weekly thrift deductions.

   6. The selected account cannot already have an
      existing thrift subscription.

   7. Payment + subscription creation happen inside
      ONE database transaction.
===================================================== */

router.post(
    "/subscribe",
    authenticate,
    async (req, res) => {

        const connection = await pool.getConnection();

        try {

            /*
            |--------------------------------------------------------------------------
            | GET LOGGED-IN USER
            |--------------------------------------------------------------------------
            */

            const userId = getLoggedInUserId(req);

            if (!userId) {

                return res.status(401).json({
                    success: false,
                    message:
                        "User authentication is required."
                });
            }


            /*
            |--------------------------------------------------------------------------
            | GET REQUEST DATA
            |--------------------------------------------------------------------------
            */

            const {
                virtual_account_id,
                accountno,
                plan,
                plans,
                profit,
                duration_weeks
            } = req.body;


            console.log(
                "CREATE THRIFT REQUEST:",
                {
                    userId,
                    virtual_account_id,
                    accountno,
                    plan,
                    plans,
                    profit,
                    duration_weeks
                }
            );


            /*
            |--------------------------------------------------------------------------
            | VALIDATE SELECTED ACCOUNT
            |--------------------------------------------------------------------------
            |
            | The user MUST select an account.
            |
            */

            if (
                !virtual_account_id &&
                !accountno
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Please select a virtual account for the thrift subscription."
                });
            }


            /*
            |--------------------------------------------------------------------------
            | START TRANSACTION
            |--------------------------------------------------------------------------
            */

            await connection.beginTransaction();


            /*
            |--------------------------------------------------------------------------
            | THRIFT PLAN
            |--------------------------------------------------------------------------
            */

            const selectedPlan =
                plan ||
                plans ||
                "Elite";


            /*
            |--------------------------------------------------------------------------
            | FORCE SUBSCRIPTION PAYMENT
            |--------------------------------------------------------------------------
            |
            | Every new thrift subscription costs ₦1,500.
            |
            | Do not trust the amount sent from the frontend.
            |
            */

            const subscriptionAmount = 1500;


            /*
            |--------------------------------------------------------------------------
            | PROFIT
            |--------------------------------------------------------------------------
            */

            const subscriptionProfit =
                Number(profit) >= 0
                    ? Number(profit)
                    : 100;


            /*
            |--------------------------------------------------------------------------
            | DURATION
            |--------------------------------------------------------------------------
            */

            const duration =
                Number(duration_weeks) > 0
                    ? Math.min(
                        Number(duration_weeks),
                        50
                    )
                    : 50;


            /*
            |--------------------------------------------------------------------------
            | WEEKLY CONTRIBUTION
            |--------------------------------------------------------------------------
            */

            const weeklyAmount = 1500;


            /*
            |--------------------------------------------------------------------------
            | FIND SELECTED VIRTUAL ACCOUNT
            |--------------------------------------------------------------------------
            |
            | This is the account the user selected from
            | the thrift subscription dropdown.
            |
            | IMPORTANT:
            |
            | This account is attached to the thrift
            | subscription.
            |
            | It is NOT the account that pays the ₦1,500.
            |
            */

            let selectedAccountRows;


            if (virtual_account_id) {

                [
                    selectedAccountRows
                ] = await connection.execute(
                    `
                    SELECT
                        id,
                        user_id,
                        accountno,
                        account_name,
                        status,
                        balance,
                        thrift_total_paid
                    FROM virtual_account
                    WHERE user_id = ?
                    AND id = ?
                    LIMIT 1
                    FOR UPDATE
                    `,
                    [
                        userId,
                        virtual_account_id
                    ]
                );

            } else {

                [
                    selectedAccountRows
                ] = await connection.execute(
                    `
                    SELECT
                        id,
                        user_id,
                        accountno,
                        account_name,
                        status,
                        balance,
                        thrift_total_paid
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
            }


            /*
            |--------------------------------------------------------------------------
            | SELECTED ACCOUNT NOT FOUND
            |--------------------------------------------------------------------------
            */

            if (
                !selectedAccountRows.length
            ) {

                await connection.rollback();

                return res.status(404).json({
                    success: false,
                    message:
                        "The selected virtual account was not found."
                });
            }


            /*
            |--------------------------------------------------------------------------
            | SELECTED ACCOUNT
            |--------------------------------------------------------------------------
            */

            const selectedAccount =
                selectedAccountRows[0];


            /*
            |--------------------------------------------------------------------------
            | VERIFY SELECTED ACCOUNT OWNERSHIP
            |--------------------------------------------------------------------------
            */

            if (
                Number(selectedAccount.user_id) !==
                Number(userId)
            ) {

                await connection.rollback();

                return res.status(403).json({
                    success: false,
                    message:
                        "You are not authorized to use the selected virtual account."
                });
            }


            /*
            |--------------------------------------------------------------------------
            | SELECTED ACCOUNT MUST BE ACTIVE
            |--------------------------------------------------------------------------
            */

            if (
                String(selectedAccount.status || "")
                    .trim()
                    .toLowerCase() !== "active"
            ) {

                await connection.rollback();

                return res.status(400).json({
                    success: false,
                    message:
                        "The selected virtual account is not active."
                });
            }


            /*
            |--------------------------------------------------------------------------
            | PREVENT DUPLICATE THRIFT SUBSCRIPTION
            |--------------------------------------------------------------------------
            |
            | The selected account is checked.
            |
            | This means:
            |
            | Account A can have one thrift subscription.
            | Account B can have one thrift subscription.
            | Account C can have one thrift subscription.
            |
            | They are independent.
            |
            */

            const [
                existingSubscription
            ] = await connection.execute(
                `
                SELECT
                    ts.id,
                    ts.plans,
                    ts.plan_status,
                    ts.current_weeks,
                    ts.virtual_account_id,
                    va.accountno
                FROM thrift_subscribe ts

                INNER JOIN virtual_account va
                    ON va.id = ts.virtual_account_id

                WHERE ts.user_id = ?
                AND ts.virtual_account_id = ?

                LIMIT 1

                FOR UPDATE
                `,
                [
                    userId,
                    selectedAccount.id
                ]
            );


            /*
            |--------------------------------------------------------------------------
            | DUPLICATE SUBSCRIPTION
            |--------------------------------------------------------------------------
            */

            if (
                existingSubscription.length
            ) {

                await connection.rollback();

                return res.status(409).json({
                    success: false,
                    message:
                        `Account ${selectedAccount.accountno} has already been subscribed to thrift.`,
                    subscription:
                        existingSubscription[0]
                });
            }


            /*
            |--------------------------------------------------------------------------
            | FIND FIRST VIRTUAL ACCOUNT
            |--------------------------------------------------------------------------
            |
            | THIS ACCOUNT PAYS THE ₦1,500.
            |
            | It is deliberately separate from the selected
            | thrift account.
            |
            */

            const [
                firstAccountRows
            ] = await connection.execute(
                `
                SELECT
                    id,
                    user_id,
                    accountno,
                    account_name,
                    status,
                    balance,
                    thrift_total_paid
                FROM virtual_account
                WHERE user_id = ?
                ORDER BY id ASC
                LIMIT 1
                FOR UPDATE
                `,
                [
                    userId
                ]
            );


            /*
            |--------------------------------------------------------------------------
            | FIRST ACCOUNT NOT FOUND
            |--------------------------------------------------------------------------
            */

            if (
                !firstAccountRows.length
            ) {

                await connection.rollback();

                return res.status(404).json({
                    success: false,
                    message:
                        "No first virtual account was found for your account."
                });
            }


            /*
            |--------------------------------------------------------------------------
            | FIRST VIRTUAL ACCOUNT
            |--------------------------------------------------------------------------
            */

            const firstAccount =
                firstAccountRows[0];


            /*
            |--------------------------------------------------------------------------
            | VERIFY FIRST ACCOUNT OWNERSHIP
            |--------------------------------------------------------------------------
            */

            if (
                Number(firstAccount.user_id) !==
                Number(userId)
            ) {

                await connection.rollback();

                return res.status(403).json({
                    success: false,
                    message:
                        "You are not authorized to use the first virtual account."
                });
            }


            /*
            |--------------------------------------------------------------------------
            | FIRST ACCOUNT MUST BE ACTIVE
            |--------------------------------------------------------------------------
            */

            if (
                String(firstAccount.status || "")
                    .trim()
                    .toLowerCase() !== "active"
            ) {

                await connection.rollback();

                return res.status(400).json({
                    success: false,
                    message:
                        "Your first virtual account is not active and cannot be used for the thrift subscription payment."
                });
            }


            /*
            |--------------------------------------------------------------------------
            | CHECK FIRST ACCOUNT BALANCE
            |--------------------------------------------------------------------------
            */

            const firstAccountBalance =
                Number(firstAccount.balance || 0);


            if (
                firstAccountBalance <
                subscriptionAmount
            ) {

                await connection.rollback();

                return res.status(400).json({
                    success: false,
                    message:
                        `Insufficient balance in your first virtual account. ₦1,500 is required to create this thrift subscription.`,
                    required_amount:
                        subscriptionAmount,
                    available_balance:
                        firstAccountBalance,
                    payment_accountno:
                        firstAccount.accountno
                });
            }


            /*
            |--------------------------------------------------------------------------
            | START DATE
            |--------------------------------------------------------------------------
            */

            const startDate =
                new Date();


            /*
            |--------------------------------------------------------------------------
            | END DATE
            |--------------------------------------------------------------------------
            */

            const endDate =
                new Date(startDate);

            endDate.setDate(
                endDate.getDate() +
                (duration * 7) -
                1
            );


            /*
            |--------------------------------------------------------------------------
            | DEDUCT ₦1,500 FROM FIRST ACCOUNT
            |--------------------------------------------------------------------------
            |
            | IMPORTANT:
            |
            | This is FIRST ACCOUNT balance.
            |
            | NOT selectedAccount.balance.
            |
            */

            const newFirstAccountBalance =
                firstAccountBalance -
                subscriptionAmount;


            const [
                debitResult
            ] = await connection.execute(
                `
                UPDATE virtual_account
                SET balance = ?
                WHERE id = ?
                AND user_id = ?
                `,
                [
                    newFirstAccountBalance,
                    firstAccount.id,
                    userId
                ]
            );


            /*
            |--------------------------------------------------------------------------
            | VERIFY DEBIT
            |--------------------------------------------------------------------------
            */

            if (
                debitResult.affectedRows !== 1
            ) {

                throw new Error(
                    "Unable to deduct ₦1,500 from the first virtual account."
                );
            }


            /*
            |--------------------------------------------------------------------------
            | CREATE THRIFT SUBSCRIPTION
            |--------------------------------------------------------------------------
            |
            | VERY IMPORTANT:
            |
            | Use selectedAccount.id here.
            |
            | NOT firstAccount.id.
            |
            |
            | Example:
            |
            | First account = Account A
            | Selected account = Account B
            |
            | Payment:
            | Account A → -₦1,500
            |
            | Subscription:
            | thrift_subscribe.virtual_account_id
            | → Account B
            |
            */

            const [
                result
            ] = await connection.execute(
                `
                INSERT INTO thrift_subscribe
                (
                    user_id,
                    virtual_account_id,
                    plans,
                    amount,
                    profit,
                    amount_paid,
                    current_weeks,
                    default_weeks,
                    last_default_week,
                    fine_amount,
                    start_date,
                    end_date,
                    plan_status
                )
                VALUES
                (
                    ?,
                    ?,
                    ?,
                    ?,
                    ?,
                    1500,
                    1,
                    0,
                    0,
                    0,
                    ?,
                    ?,
                    'Active'
                )
                `,
                [
                    userId,

                    /*
                    |----------------------------------------------
                    | SELECTED ACCOUNT
                    |----------------------------------------------
                    */

                    selectedAccount.id,

                    selectedPlan,

                    subscriptionAmount,

                    subscriptionProfit,

                    startDate,

                    endDate
                ]
            );


			/*
			|--------------------------------------------------------------------------
			| CREATE INITIAL WEEKLY HISTORY
			|--------------------------------------------------------------------------
			|
			| The ₦1,500 paid during subscription creation represents
			| the first thrift week.
			|
			| Therefore Week 1 is immediately recorded as Paid.
			|
			| This is linked to the SELECTED thrift account.
			|
			| The actual money came from FIRST virtual account.
			|
			*/
			
			await connection.execute(
			    `
			    INSERT INTO thrift_weekly_history
			    (
			        thrift_subscribe_id,
			        user_id,
			        virtual_account_id,
			        week_number,
			        amount,
			        status,
			        fine_amount
			    )
			    VALUES
			    (
			        ?,
			        ?,
			        ?,
			        ?,
			        ?,
			        'Paid',
			        ?
			    )
			    `,
			    [
			        result.insertId,
			        userId,
			        selectedAccount.id,
			        1,
			        WEEKLY_AMOUNT,
			        0
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
            | SUCCESS LOG
            |--------------------------------------------------------------------------
            */

            console.log(
                "================================="
            );

            console.log(
                "THRIFT SUBSCRIPTION CREATED"
            );

            console.log(
                "User ID:",
                userId
            );

            console.log(
                "Thrift ID:",
                result.insertId
            );

            console.log(
                "SELECTED THRIFT ACCOUNT:",
                selectedAccount.accountno
            );

            console.log(
                "SELECTED THRIFT ACCOUNT ID:",
                selectedAccount.id
            );

            console.log(
                "PAYMENT ACCOUNT:",
                firstAccount.accountno
            );

            console.log(
                "PAYMENT ACCOUNT ID:",
                firstAccount.id
            );

            console.log(
                "PAYMENT AMOUNT:",
                subscriptionAmount
            );

            console.log(
                "FIRST ACCOUNT PREVIOUS BALANCE:",
                firstAccountBalance
            );

            console.log(
                "FIRST ACCOUNT NEW BALANCE:",
                newFirstAccountBalance
            );

            console.log(
                "================================="
            );


            /*
            |--------------------------------------------------------------------------
            | SUCCESS RESPONSE
            |--------------------------------------------------------------------------
            */

            return res.status(201).json({

                success: true,

                message:
                    "Thrift subscription created successfully. ₦1,500 was deducted from your first virtual account.",

                thrift_id:
                    result.insertId,

                user_id:
                    userId,


                /*
                |--------------------------------------------------------------------------
                | SELECTED THRIFT ACCOUNT
                |--------------------------------------------------------------------------
                */

                virtual_account_id:
                    selectedAccount.id,

                accountno:
                    selectedAccount.accountno,

                account_name:
                    selectedAccount.account_name,


                /*
                |--------------------------------------------------------------------------
                | PAYMENT ACCOUNT
                |--------------------------------------------------------------------------
                */

                payment_virtual_account_id:
                    firstAccount.id,

                payment_accountno:
                    firstAccount.accountno,

                payment_account_name:
                    firstAccount.account_name,

                payment_amount:
                    subscriptionAmount,

                payment_previous_balance:
                    firstAccountBalance,

                payment_remaining_balance:
                    newFirstAccountBalance,


                /*
                |--------------------------------------------------------------------------
                | THRIFT DETAILS
                |--------------------------------------------------------------------------
                */

                plan:
                    selectedPlan,

                amount:
                    subscriptionAmount,

                profit:
                    subscriptionProfit,

                duration_weeks:
                    duration,

                weekly_contribution:
                    weeklyAmount,

                current_weeks:
                    0,

                amount_paid:
                    0,

                default_weeks:
                    0,

                fine_amount:
                    0,

                plan_status:
                    "Active",

                start_date:
                    startDate,

                end_date:
                    endDate
            });


        } catch (error) {

            /*
            |--------------------------------------------------------------------------
            | ROLLBACK
            |--------------------------------------------------------------------------
            */

            try {

                await connection.rollback();

            } catch (rollbackError) {

                console.error(
                    "ROLLBACK ERROR:",
                    rollbackError
                );
            }


            /*
            |--------------------------------------------------------------------------
            | ERROR LOG
            |--------------------------------------------------------------------------
            */

            console.error(
                "================================="
            );

            console.error(
                "CREATE THRIFT SUBSCRIPTION ERROR"
            );

            console.error(
                "MESSAGE:",
                error.message
            );

            console.error(
                "CODE:",
                error.code
            );

            console.error(
                "SQL STATE:",
                error.sqlState
            );

            console.error(
                "SQL:",
                error.sql
            );

            console.error(
                "FULL ERROR:",
                error
            );

            console.error(
                "================================="
            );


            /*
            |--------------------------------------------------------------------------
            | ERROR RESPONSE
            |--------------------------------------------------------------------------
            */

            return res.status(500).json({

                success: false,

                message:
                    "Unable to create thrift subscription.",

                error:
                    error.message,

                code:
                    error.code || null,

                sqlState:
                    error.sqlState || null
            });

        } finally {

            /*
            |--------------------------------------------------------------------------
            | RELEASE CONNECTION
            |--------------------------------------------------------------------------
            */

            connection.release();
        }
    }
);






/* =====================================================
   GET USER THRIFT SUBSCRIPTIONS
===================================================== */

router.get(
    "/my-subscriptions",
    authenticate,
    async (req, res) => {

        try {

            const userId = getLoggedInUserId(req);

            if (!userId) {
                return res.status(401).json({
                    success: false,
                    message: "User authentication is required."
                });
            }


            const [subscriptions] =
                await pool.execute(
                    `
                    SELECT
                        ts.id,
                        ts.user_id,
                        ts.virtual_account_id,
                        ts.plans,
                        ts.amount,
                        ts.profit,
                        ts.amount_paid,
                        ts.current_weeks,
                        ts.default_weeks,
                        ts.last_default_week,
                        ts.fine_amount,
                        ts.start_date,
                        ts.end_date,
                        ts.plan_status,
                        va.accountno,
                        va.account_name,
                        va.balance,
                        va.thrift_total_paid
                    FROM thrift_subscribe ts
                    LEFT JOIN virtual_account va
                        ON va.id = ts.virtual_account_id
                    WHERE ts.user_id = ?
                    ORDER BY ts.id DESC
                    `,
                    [userId]
                );


            return res.json({
                success: true,
                user_id: userId,
                count: subscriptions.length,
                subscriptions
            });

        } catch (error) {

            console.error(
                "GET USER THRIFT ERROR:",
                error
            );

            return res.status(500).json({
                success: false,
                message: "Unable to retrieve thrift subscriptions.",
                error: error.message
            });
        }
    }
);


/* =====================================================
   PROCESS WEEKLY THRIFT DEDUCTIONS
===================================================== */

router.post(
    "/process-weekly-deductions",
    authenticate,
    async (req, res) => {

        const connection = await pool.getConnection();

        try {

            const userId = getLoggedInUserId(req);

            if (!userId) {
                return res.status(401).json({
                    success: false,
                    message: "User authentication is required."
                });
            }

            await connection.beginTransaction();


            /*
            =====================================================
            GET FIRST VIRTUAL ACCOUNT

            IMPORTANT:
            This is the ONLY virtual account used to fund
            thrift deductions.

            We deliberately order by id ASC so the first
            virtual account is always used.

            We DO NOT fallback to another virtual account.
            =====================================================
            */

            const [fundingAccounts] =
                await connection.execute(
                    `
                    SELECT
                        id,
                        accountno,
                        balance,
                        thrift_total_paid,
                        status AS account_status
                    FROM virtual_account
                    WHERE user_id = ?
                    ORDER BY id ASC
                    LIMIT 1
                    FOR UPDATE
                    `,
                    [userId]
                );


            if (!fundingAccounts.length) {

                await connection.rollback();

                return res.status(400).json({
                    success: false,
                    message:
                        "No virtual account was found for this user."
                });
            }


            /*
            =====================================================
            FIRST VIRTUAL ACCOUNT IS THE ONLY FUNDING ACCOUNT
            =====================================================
            */

            const fundingAccount =
                fundingAccounts[0];


            if (
                String(fundingAccount.account_status)
                    .toLowerCase() !== "active"
            ) {

                await connection.rollback();

                return res.status(400).json({
                    success: false,
                    message:
                        "The first virtual account is inactive."
                });
            }


            /*
            =====================================================
            THIS BALANCE IS THE GLOBAL THRIFT FUNDING BALANCE

            It will be reduced as each subscription is paid.

            Example:

            Starting balance = 4500

            Subscription 1 = -1500
            Remaining     = 3000

            Subscription 2 = -1500
            Remaining     = 1500

            Subscription 3 = -1500
            Remaining     = 0
            =====================================================
            */

            let fundingBalance =
                Number(fundingAccount.balance) || 0;


            let fundingThriftTotalPaid =
                Number(fundingAccount.thrift_total_paid) || 0;


            /*
            -------------------------------------------------
            GET ACTIVE SUBSCRIPTIONS
            -------------------------------------------------
            */

            const [subscriptions] =
                await connection.execute(
                    `
                    SELECT
                        ts.id,
                        ts.user_id,
                        ts.virtual_account_id,
                        ts.amount,
                        ts.amount_paid,
                        ts.current_weeks,
                        ts.default_weeks,
                        ts.last_default_week,
                        ts.fine_amount,
                        ts.start_date,
                        ts.end_date,
                        ts.plan_status,

                        va.accountno,
                        va.status AS account_status

                    FROM thrift_subscribe ts

                    INNER JOIN virtual_account va
                        ON va.id = ts.virtual_account_id

                    WHERE ts.user_id = ?
                    AND LOWER(ts.plan_status) IN
                        ('active', 'running')

                    ORDER BY ts.id ASC

                    FOR UPDATE
                    `,
                    [userId]
                );


            const results = [];


            const now = new Date();

            const DAY_MS =
                24 * 60 * 60 * 1000;


            /*
            -------------------------------------------------
            PROCESS EACH SUBSCRIPTION
            -------------------------------------------------
            */

            for (const subscription of subscriptions) {

                let currentWeeks =
                    Number(subscription.current_weeks) || 0;

                let defaultWeeks =
                    Number(subscription.default_weeks) || 0;

                let amountPaid =
                    Number(subscription.amount_paid) || 0;

                let fineAmount =
                    Number(subscription.fine_amount) || 0;


                /*
                =================================================
                IMPORTANT:

                DO NOT use subscription.balance.

                The subscription's virtual account balance is
                NOT used to determine whether this thrift week
                can be paid.

                The ONLY balance used is:

                    fundingBalance

                which belongs to the FIRST virtual account.
                =================================================
                */


                /*
                -------------------------------------------------
                SKIP INVALID / INACTIVE ACCOUNT
                -------------------------------------------------
                */

                if (
                    String(subscription.account_status)
                        .toLowerCase() !== "active"
                ) {

                    results.push({
                        thrift_id: subscription.id,
                        accountno: subscription.accountno,
                        processed: 0,
                        message:
                            "Subscription virtual account is inactive."
                    });

                    continue;
                }


                /*
                -------------------------------------------------
                CHECK START DATE
                -------------------------------------------------
                */

                const startDate =
                    new Date(subscription.start_date);


                if (
                    Number.isNaN(
                        startDate.getTime()
                    )
                ) {

                    results.push({
                        thrift_id: subscription.id,
                        accountno: subscription.accountno,
                        processed: 0,
                        message:
                            "Invalid thrift start date."
                    });

                    continue;
                }


                /*
                -------------------------------------------------
                CALCULATE SCHEDULED WEEK
                -------------------------------------------------
                */

                const elapsedDays =
                    Math.floor(
                        (
                            now.getTime() -
                            startDate.getTime()
                        ) / DAY_MS
                    );


                let scheduledWeek =
                    Math.floor(
                        elapsedDays / 7
                    ) + 1;


                if (scheduledWeek < 1) {
                    scheduledWeek = 1;
                }


                if (scheduledWeek > MAX_WEEKS) {
                    scheduledWeek = MAX_WEEKS;
                }


                /*
                -------------------------------------------------
                ALREADY COMPLETED
                -------------------------------------------------
                */

                if (currentWeeks >= MAX_WEEKS) {

                    await connection.execute(
                        `
                        UPDATE thrift_subscribe
                        SET plan_status = 'Completed'
                        WHERE id = ?
                        AND user_id = ?
                        `,
                        [
                            subscription.id,
                            userId
                        ]
                    );


                    results.push({
                        thrift_id: subscription.id,
                        accountno: subscription.accountno,
                        processed: 0,
                        message:
                            "Thrift plan is already completed."
                    });

                    continue;
                }


                /*
                -------------------------------------------------
                NOTHING DUE YET
                -------------------------------------------------
                */

                if (currentWeeks >= scheduledWeek) {

                    results.push({
                        thrift_id: subscription.id,
                        accountno: subscription.accountno,
                        processed: 0,
                        current_weeks: currentWeeks,
                        message:
                            "No new thrift week is due."
                    });

                    continue;
                }


                let processedCount = 0;
                let paidCount = 0;
                let defaultCount = 0;


                /*
                -------------------------------------------------
                PROCESS EVERY MISSED / DUE WEEK
                -------------------------------------------------
                */

                for (
                    let week = currentWeeks + 1;
                    week <= scheduledWeek &&
                    week <= MAX_WEEKS;
                    week++
                ) {


                    /*
                    -------------------------------------------------
                    DOUBLE-CHECK HISTORY
                    -------------------------------------------------
                    */

                    const [existingHistory] =
                        await connection.execute(
                            `
                            SELECT
                                id,
                                status
                            FROM thrift_weekly_history
                            WHERE thrift_subscribe_id = ?
                            AND week_number = ?
                            LIMIT 1
                            FOR UPDATE
                            `,
                            [
                                subscription.id,
                                week
                            ]
                        );


                    /*
                    -------------------------------------------------
                    IF WEEK ALREADY EXISTS,
                    DO NOT PROCESS AGAIN
                    -------------------------------------------------
                    */

                    if (existingHistory.length) {

                        currentWeeks = week;

                        continue;
                    }


                    /*
                    =================================================
                    PAID WEEK

                    ONLY THE FIRST VIRTUAL ACCOUNT BALANCE
                    IS CHECKED.
                    =================================================
                    */

                    if (fundingBalance >= WEEKLY_AMOUNT) {

                        /*
                        -------------------------------------------------
                        REMOVE WEEKLY AMOUNT FROM FIRST ACCOUNT
                        -------------------------------------------------
                        */

                        fundingBalance -= WEEKLY_AMOUNT;


                        /*
                        -------------------------------------------------
                        UPDATE THRIFT TOTAL PAID OF FIRST ACCOUNT
                        -------------------------------------------------
                        */

                        fundingThriftTotalPaid +=
                            WEEKLY_AMOUNT;


                        /*
                        -------------------------------------------------
                        UPDATE SUBSCRIPTION PAYMENT TOTAL
                        -------------------------------------------------
                        */

                        amountPaid += WEEKLY_AMOUNT;


                        currentWeeks++;


                        processedCount++;

                        paidCount++;


                        /*
                        -------------------------------------------------
                        INSERT PAID HISTORY
                        -------------------------------------------------
                        */

                        await connection.execute(
                            `
                            INSERT INTO thrift_weekly_history
                            (
                                thrift_subscribe_id,
                                user_id,
                                virtual_account_id,
                                week_number,
                                amount,
                                status,
                                fine_amount
                            )
                            VALUES
                            (
                                ?,
                                ?,
                                ?,
                                ?,
                                ?,
                                'Paid',
                                0
                            )
                            `,
                            [
                                subscription.id,
                                userId,
                                subscription.virtual_account_id,
                                week,
                                WEEKLY_AMOUNT
                            ]
                        );

                    }


                    /*
                    =================================================
                    DEFAULT WEEK

                    IMPORTANT:

                    If the FIRST virtual account does not have
                    enough money, ONLY THIS subscription/week
                    becomes default.

                    We DO NOT check another virtual account.

                    We DO NOT reset fundingBalance.

                    We DO NOT use subscription.virtual_account
                    balance as a fallback.
                    =================================================
                    */

                    else {

                        currentWeeks++;

                        defaultWeeks++;

                        fineAmount += FINE_AMOUNT;

                        processedCount++;

                        defaultCount++;


                        /*
                        -------------------------------------------------
                        SAVE LAST DEFAULT WEEK
                        -------------------------------------------------
                        */

                        const lastDefaultWeek =
                            week;


                        await connection.execute(
                            `
                            INSERT INTO thrift_weekly_history
                            (
                                thrift_subscribe_id,
                                user_id,
                                virtual_account_id,
                                week_number,
                                amount,
                                status,
                                fine_amount
                            )
                            VALUES
                            (
                                ?,
                                ?,
                                ?,
                                ?,
                                ?,
                                'Default',
                                ?
                            )
                            `,
                            [
                                subscription.id,
                                userId,
                                subscription.virtual_account_id,
                                week,
                                WEEKLY_AMOUNT,
                                FINE_AMOUNT
                            ]
                        );


                        /*
                        -------------------------------------------------
                        SAVE LAST DEFAULT WEEK
                        -------------------------------------------------
                        */

                        await connection.execute(
                            `
                            UPDATE thrift_subscribe
                            SET last_default_week = ?
                            WHERE id = ?
                            `,
                            [
                                lastDefaultWeek,
                                subscription.id
                            ]
                        );
                    }
                }


                /*
                -------------------------------------------------
                DETERMINE PLAN STATUS
                -------------------------------------------------
                */

                let planStatus = "Active";

                if (currentWeeks >= MAX_WEEKS) {
                    planStatus = "Completed";
                }


                /*
                -------------------------------------------------
                UPDATE SUBSCRIPTION

                Notice that we DO NOT update the subscription's
                virtual_account balance here.

                The deduction belongs to the FIRST virtual
                account.
                -------------------------------------------------
                */

                await connection.execute(
                    `
                    UPDATE thrift_subscribe
                    SET
                        amount_paid = ?,
                        current_weeks = ?,
                        default_weeks = ?,
                        fine_amount = ?,
                        plan_status = ?
                    WHERE id = ?
                    AND user_id = ?
                    `,
                    [
                        amountPaid,
                        currentWeeks,
                        defaultWeeks,
                        fineAmount,
                        planStatus,
                        subscription.id,
                        userId
                    ]
                );


                results.push({
                    thrift_id: subscription.id,
                    accountno: subscription.accountno,
                    funding_accountno:
                        fundingAccount.accountno,
                    processed: processedCount,
                    paid_weeks: paidCount,
                    default_weeks: defaultCount,
                    current_weeks: currentWeeks,
                    amount_paid: amountPaid,
                    fine_amount: fineAmount,
                    plan_status: planStatus,
                    remaining_funding_balance:
                        fundingBalance
                });
            }


            /*
            =====================================================
            UPDATE FIRST VIRTUAL ACCOUNT

            ALL SUCCESSFUL THRIFT DEDUCTIONS have already been
            subtracted from fundingBalance.

            Only now do we persist the final balance.
            =====================================================
            */

            await connection.execute(
                `
                UPDATE virtual_account
                SET
                    balance = ?,
                    thrift_total_paid = ?
                WHERE id = ?
                AND user_id = ?
                `,
                [
                    fundingBalance,
                    fundingThriftTotalPaid,
                    fundingAccount.id,
                    userId
                ]
            );


            /*
            -------------------------------------------------
            COMMIT
            -------------------------------------------------
            */

            await connection.commit();


            return res.json({
                success: true,
                message:
                    "Weekly thrift processing completed.",

                /*
                -------------------------------------------------
                SHOW WHICH ACCOUNT WAS USED AS THE FUNDING ACCOUNT
                -------------------------------------------------
                */

                funding_account: {
                    id: fundingAccount.id,
                    accountno: fundingAccount.accountno,
                    remaining_balance: fundingBalance
                },

                weekly_amount: WEEKLY_AMOUNT,
                fine_per_default: FINE_AMOUNT,
                max_weeks: MAX_WEEKS,
                results
            });


        } catch (error) {

            await connection.rollback();

            console.error(
                "PROCESS WEEKLY THRIFT ERROR:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Unable to process weekly thrift deductions.",
                error: error.message
            });

        } finally {

            connection.release();
        }
    }
);




/* =====================================================
   GET WEEKLY HISTORY
===================================================== */

router.get(
    "/weekly-history/:thriftId",
    authenticate,
    async (req, res) => {

        try {

            const userId = getLoggedInUserId(req);

            const thriftId =
                Number(req.params.thriftId);


            if (!userId) {
                return res.status(401).json({
                    success: false,
                    message: "User authentication is required."
                });
            }


            if (
                !thriftId ||
                thriftId <= 0
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Invalid thrift subscription ID."
                });
            }


            /*
            -------------------------------------------------
            VERIFY SUBSCRIPTION BELONGS TO USER
            -------------------------------------------------
            */

            const [subscriptions] =
                await pool.execute(
                    `
                    SELECT
                        ts.id,
                        ts.user_id,
                        ts.virtual_account_id,
                        ts.plans,
                        ts.amount,
                        ts.amount_paid,
                        ts.current_weeks,
                        ts.default_weeks,
                        ts.fine_amount,
                        ts.start_date,
                        ts.end_date,
                        ts.plan_status,
                        va.accountno,
                        va.account_name
                    FROM thrift_subscribe ts
                    LEFT JOIN virtual_account va
                        ON va.id = ts.virtual_account_id
                    WHERE ts.id = ?
                    AND ts.user_id = ?
                    LIMIT 1
                    `,
                    [
                        thriftId,
                        userId
                    ]
                );


            if (!subscriptions.length) {

                return res.status(404).json({
                    success: false,
                    message:
                        "Thrift subscription not found."
                });
            }


            /*
            -------------------------------------------------
            GET HISTORY
            -------------------------------------------------
            */

            const [history] =
                await pool.execute(
                    `
                    SELECT
                        id,
                        thrift_subscribe_id,
                        user_id,
                        virtual_account_id,
                        week_number,
                        amount,
                        status,
                        fine_amount,
                        created_at
                    FROM thrift_weekly_history
                    WHERE thrift_subscribe_id = ?
                    AND user_id = ?
                    ORDER BY week_number ASC
                    `,
                    [
                        thriftId,
                        userId
                    ]
                );


            return res.json({
                success: true,
                thrift: subscriptions[0],
                history
            });

        } catch (error) {

            console.error(
                "GET WEEKLY HISTORY ERROR:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Unable to retrieve weekly thrift history.",
                error: error.message
            });
        }
    }
);





router.get(
    "/clearance",
    authenticate,
    async (req, res) => {

        try {

            const userId =
                req.user.id;

            const [rows] =
                await pool.query(
                    `
                    SELECT
                        ts.id,
                        ts.accountno,
                        ts.amount_paid,
                        ts.current_weeks,
                        ts.fine_amount,
                        ts.start_date,
                        ts.end_date,
                        ts.plan_status,
                        ts.clearance_fee,
                        ts.clearance_status,
                        ts.clearance_accountno,
                        ts.clearance_paid_at

                    FROM thrift_subscribe ts

                    WHERE ts.user_id = ?

                      AND ts.current_weeks >= 50

                      AND (
                            ts.clearance_status IS NULL
                            OR ts.clearance_status <> 'cleared'
                      )

                    ORDER BY ts.id ASC
                    `,
                    [userId]
                );


            return res.json({

                success: true,

                accounts: rows

            });


        } catch (error) {

            console.error(
                "GET CLEARANCE ACCOUNTS ERROR:",
                error
            );

            return res.status(500).json({

                success: false,

                message:
                    "Unable to load clearance accounts.",

                error:
                    error.message

            });

        }

    }
);






/* =====================================================
   PAY ALL THRIFT CLEARANCE FEES

   POST /api/thrift/clearance/pay

   CLEARANCE RULE:

   - ₦2,000 per completed thrift subscription
   - All completed subscriptions are cleared together
   - Total fee is deducted from the FIRST
     virtual account by id ASC
   - Wallet transaction is recorded
===================================================== */

router.post(
    "/clearance/pay",
    authenticate,
    async (req, res) => {

        const connection =
            await pool.getConnection();

        let transactionStarted = false;

        try {

            console.log(
                "=========================================="
            );

            console.log(
                "THRIFT CLEARANCE PAYMENT START"
            );


            /* =================================================
               1. GET LOGGED-IN USER
            ================================================= */

            const userId =
                getLoggedInUserId(req);


            if (!userId) {

                return res.status(401).json({

                    success: false,

                    message:
                        "User authentication is required."

                });

            }


            console.log(
                "CLEARANCE USER ID:",
                userId
            );


            /* =================================================
               2. CLEARANCE CONSTANT
            ================================================= */

            const CLEARANCE_FEE = 2000;


            /* =================================================
               3. START TRANSACTION
            ================================================= */

            await connection.beginTransaction();

            transactionStarted = true;


            /* =================================================
               4. GET USER EMAIL
            ================================================= */

            const [userRows] =
                await connection.execute(
                    `
                    SELECT
                        id,
                        email

                    FROM users

                    WHERE id = ?

                    LIMIT 1
                    `,
                    [
                        userId
                    ]
                );


            if (!userRows.length) {

                throw new Error(
                    "User account was not found."
                );

            }


            const userEmail =
                userRows[0].email || "";


            /* =================================================
               5. GET ALL COMPLETED THRIFT ACCOUNTS
            ================================================= */

            const [subscriptions] =
                await connection.execute(
                    `
                    SELECT
                        ts.id,
                        ts.user_id,
                        ts.virtual_account_id,
                        ts.amount_paid,
                        ts.current_weeks,
                        ts.fine_amount,
                        ts.plan_status,
                        ts.clearance_status,
                        va.accountno

                    FROM thrift_subscribe ts

                    LEFT JOIN virtual_account va
                        ON va.id = ts.virtual_account_id

                    WHERE ts.user_id = ?

                    AND ts.current_weeks >= ?

                    AND (
                        ts.clearance_status IS NULL
                        OR LOWER(
                            TRIM(
                                ts.clearance_status
                            )
                        ) <> 'cleared'
                    )

                    ORDER BY ts.id ASC

                    FOR UPDATE
                    `,
                    [
                        userId,
                        MAX_WEEKS
                    ]
                );


            console.log(
                "COMPLETED THRIFT ACCOUNTS:",
                subscriptions.length
            );


            /* =================================================
               6. NOTHING TO CLEAR
            ================================================= */

            if (!subscriptions.length) {

                await connection.rollback();

                transactionStarted = false;

                return res.status(400).json({

                    success: false,

                    message:
                        "There are no completed thrift accounts awaiting clearance."

                });

            }


            /* =================================================
               7. CALCULATE TOTAL CLEARANCE FEE
            ================================================= */

            const totalAccounts =
                subscriptions.length;


            const totalClearanceFee =
                totalAccounts *
                CLEARANCE_FEE;


            console.log(
                "TOTAL ACCOUNTS:",
                totalAccounts
            );

            console.log(
                "TOTAL CLEARANCE FEE:",
                totalClearanceFee
            );


            /* =================================================
               8. GET FIRST VIRTUAL ACCOUNT
               
               This is the account that pays ALL clearance fees.
            ================================================= */

            const [firstAccounts] =
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

                    ORDER BY id ASC

                    LIMIT 1

                    FOR UPDATE
                    `,
                    [
                        userId
                    ]
                );


            if (!firstAccounts.length) {

                await connection.rollback();

                transactionStarted = false;

                return res.status(400).json({

                    success: false,

                    message:
                        "You do not have a virtual account to pay the clearance fee."

                });

            }


            const firstAccount =
                firstAccounts[0];


            /* =================================================
               9. CHECK ACCOUNT STATUS
            ================================================= */

            if (
                String(firstAccount.status || "")
                    .trim()
                    .toLowerCase() !== "active"
            ) {

                await connection.rollback();

                transactionStarted = false;

                return res.status(400).json({

                    success: false,

                    message:
                        "Your first virtual account is inactive.",

                    accountno:
                        firstAccount.accountno

                });

            }


            /* =================================================
               10. CHECK BALANCE
            ================================================= */

            const currentBalance =
                Number(
                    firstAccount.balance || 0
                );


            if (
                currentBalance <
                totalClearanceFee
            ) {

                await connection.rollback();

                transactionStarted = false;

                return res.status(400).json({

                    success: false,

                    message:
                        `Insufficient balance. ₦${totalClearanceFee.toLocaleString()} is required to clear ${totalAccounts} thrift account(s).`,

                    required:
                        totalClearanceFee,

                    available:
                        currentBalance,

                    accountno:
                        firstAccount.accountno,

                    thrift_accounts:
                        totalAccounts

                });

            }


            /* =================================================
               11. CALCULATE NEW BALANCE
            ================================================= */

            const newBalance =
                currentBalance -
                totalClearanceFee;


            /* =================================================
               12. DEDUCT FROM FIRST ACCOUNT
            ================================================= */

            const [balanceResult] =
                await connection.execute(
                    `
                    UPDATE virtual_account

                    SET balance = ?

                    WHERE id = ?

                    AND user_id = ?
                    `,
                    [
                        newBalance,
                        firstAccount.id,
                        userId
                    ]
                );


            if (
                balanceResult.affectedRows !== 1
            ) {

                throw new Error(
                    "Unable to deduct the clearance fee from the first virtual account."
                );

            }


            /* =================================================
               13. MARK ALL COMPLETED THRIFT ACCOUNTS CLEARED
            ================================================= */

            for (
                const subscription
                of subscriptions
            ) {

                const [clearResult] =
                    await connection.execute(
                        `
                        UPDATE thrift_subscribe

                        SET
                            clearance_fee = ?,
                            clearance_status = 'cleared',
                            clearance_accountno = ?,
                            clearance_paid_at = NOW()

                        WHERE id = ?

                        AND user_id = ?
                        `,
                        [
                            CLEARANCE_FEE,
                            firstAccount.accountno,
                            subscription.id,
                            userId
                        ]
                    );


                if (
                    clearResult.affectedRows !== 1
                ) {

                    throw new Error(
                        `Unable to mark thrift subscription ${subscription.id} as cleared.`
                    );

                }

            }


            /* =================================================
               14. CREATE TRANSACTION REFERENCE
            ================================================= */

            const reference =
                `THRIFT-CLEARANCE-${userId}-${Date.now()}`;


            const transactionId =
                `TC-${userId}-${Date.now()}`;


            /* =================================================
               15. RECORD WALLET TRANSACTION
               
               EXACT COLUMNS FROM YOUR DATABASE:
               
               user_id
               accountno
               email
               amount
               payment_method
               virtual_account_id
               status
               reference
               description
               created_at
               updated_at
               paystack_status
               transaction_id
               paid_at
            ================================================= */

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
                    created_at,
                    updated_at,
                    paystack_status,
                    transaction_id,
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
                    NOW(),
                    NOW(),
                    ?,
                    ?,
                    NOW()
                )
                `,
                [
                    userId,

                    firstAccount.accountno,

                    userEmail,

                    totalClearanceFee,

                    "thrift_clearance",

                    firstAccount.id,

                    "success",

                    reference,

                    `Thrift clearance fee for ${totalAccounts} completed thrift account(s)`,

                    "success",

                    transactionId
                ]
            );


            /* =================================================
               16. COMMIT
            ================================================= */

            await connection.commit();

            transactionStarted = false;


            console.log(
                "=========================================="
            );

            console.log(
                "THRIFT CLEARANCE SUCCESS"
            );

            console.log(
                "USER:",
                userId
            );

            console.log(
                "ACCOUNTS:",
                totalAccounts
            );

            console.log(
                "FEE:",
                totalClearanceFee
            );

            console.log(
                "CHARGED ACCOUNT:",
                firstAccount.accountno
            );

            console.log(
                "NEW BALANCE:",
                newBalance
            );

            console.log(
                "REFERENCE:",
                reference
            );

            console.log(
                "=========================================="
            );


            /* =================================================
               17. SUCCESS RESPONSE
            ================================================= */

            return res.status(200).json({

                success: true,

                message:
                    `Clearance completed successfully for ${totalAccounts} thrift account(s).`,

                thrift_accounts:
                    totalAccounts,

                clearance_fee_per_account:
                    CLEARANCE_FEE,

                total_clearance_fee:
                    totalClearanceFee,

                deducted_from_account:
                    firstAccount.accountno,

                deducted_amount:
                    totalClearanceFee,

                previous_balance:
                    currentBalance,

                remaining_balance:
                    newBalance,

                reference:
                    reference,

                transaction_id:
                    transactionId,

                status:
                    "success",

                cleared_accounts:
                    subscriptions.map(
                        subscription => ({

                            subscription_id:
                                subscription.id,

                            accountno:
                                subscription.accountno,

                            amount_paid:
                                subscription.amount_paid,

                            current_weeks:
                                subscription.current_weeks,

                            clearance_fee:
                                CLEARANCE_FEE,

                            clearance_status:
                                "cleared"

                        })
                    )

            });


        } catch (error) {


            /* =================================================
               ROLLBACK
            ================================================= */

            if (transactionStarted) {

                try {

                    await connection.rollback();

                } catch (rollbackError) {

                    console.error(
                        "ROLLBACK ERROR:",
                        rollbackError
                    );

                }

            }


            /* =================================================
               FULL ERROR LOG
            ================================================= */

            console.error(
                "=========================================="
            );

            console.error(
                "THRIFT CLEARANCE ERROR"
            );

            console.error(
                "USER ID:",
                getLoggedInUserId(req)
            );

            console.error(
                "MESSAGE:",
                error.message
            );

            console.error(
                "CODE:",
                error.code
            );

            console.error(
                "SQL STATE:",
                error.sqlState
            );

            console.error(
                "SQL MESSAGE:",
                error.sqlMessage
            );

            console.error(
                "SQL:",
                error.sql
            );

            console.error(
                "FULL ERROR:",
                error
            );

            console.error(
                "=========================================="
            );


            return res.status(500).json({

                success: false,

                message:
                    "Unable to process thrift clearance.",

                error:
                    error.message || null,

                code:
                    error.code || null,

                sqlState:
                    error.sqlState || null,

                sqlMessage:
                    error.sqlMessage || null

            });


        } finally {

            connection.release();

        }

    }
);







/* =====================================================
   CLEAR DEFAULT
===================================================== */

router.post(
    "/clear-default",
    authenticate,
    async (req, res) => {

        const connection = await pool.getConnection();

        try {

            const userId =
                getLoggedInUserId(req);

            const thriftId =
                Number(req.body.thrift_id);

            const weekNumber =
                Number(req.body.week_number);


            if (!userId) {

                return res.status(401).json({
                    success: false,
                    message:
                        "User authentication is required."
                });

            }


            if (
                !thriftId ||
                thriftId <= 0 ||
                !weekNumber ||
                weekNumber <= 0
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Invalid thrift subscription or week."
                });

            }


            /*
            =====================================================
            CONSTANTS
            =====================================================
            */

            const DEFAULT_CLEAR_AMOUNT = 3000;

            /*
             * IMPORTANT:
             *
             * When clearing a default:
             *
             * User pays ₦3,000 from the FIRST virtual account.
             *
             * But only ₦1,500 counts as thrift contribution.
             *
             * Therefore:
             *
             * balance              - ₦3,000
             * amount_paid          + ₦1,500
             * thrift_total_paid    + ₦1,500
             * fine_amount          - ₦1,500
             */


            await connection.beginTransaction();


            /*
            =====================================================
            1. GET THRIFT SUBSCRIPTION
            =====================================================
            */

            const [subscriptions] =
                await connection.execute(
                    `
                    SELECT
                        ts.id,
                        ts.user_id,
                        ts.virtual_account_id,
                        ts.amount_paid,
                        ts.current_weeks,
                        ts.default_weeks,
                        ts.fine_amount,
                        ts.plan_status

                    FROM thrift_subscribe ts

                    WHERE
                        ts.id = ?

                        AND

                        ts.user_id = ?

                    LIMIT 1

                    FOR UPDATE
                    `,
                    [
                        thriftId,
                        userId
                    ]
                );


            if (!subscriptions.length) {

                await connection.rollback();

                return res.status(404).json({
                    success: false,
                    message:
                        "Thrift subscription not found."
                });

            }


            const subscription =
                subscriptions[0];


            /*
            =====================================================
            2. GET THE DEFAULT WEEK
            =====================================================
            */

            const [historyRows] =
                await connection.execute(
                    `
                    SELECT
                        id,
                        week_number,
                        amount,
                        status,
                        fine_amount

                    FROM thrift_weekly_history

                    WHERE
                        thrift_subscribe_id = ?

                        AND

                        user_id = ?

                        AND

                        week_number = ?

                    LIMIT 1

                    FOR UPDATE
                    `,
                    [
                        thriftId,
                        userId,
                        weekNumber
                    ]
                );


            if (!historyRows.length) {

                await connection.rollback();

                return res.status(404).json({
                    success: false,
                    message:
                        `Week ${weekNumber} was not found.`
                });

            }


            const history =
                historyRows[0];


            /*
            =====================================================
            3. MAKE SURE THIS IS A DEFAULT
            =====================================================
            */

            if (
                String(history.status || "")
                    .trim()
                    .toLowerCase() !== "default"
            ) {

                await connection.rollback();

                return res.status(400).json({
                    success: false,
                    message:
                        `Week ${weekNumber} is not a default.`
                });

            }


            /*
            =====================================================
            4. GET FIRST VIRTUAL ACCOUNT
            =====================================================
            |
            | VERY IMPORTANT:
            |
            | We intentionally DO NOT use:
            |
            | subscription.virtual_account_id
            |
            | Instead, we get the user's FIRST account:
            |
            | ORDER BY id ASC
            | LIMIT 1
            |
            =====================================================
            */

            const [firstAccounts] =
                await connection.execute(
                    `
                    SELECT
                        id,
                        user_id,
                        accountno,
                        account_name,
                        status,
                        balance,
                        thrift_total_paid

                    FROM virtual_account

                    WHERE
                        user_id = ?

                    ORDER BY id ASC

                    LIMIT 1

                    FOR UPDATE
                    `,
                    [
                        userId
                    ]
                );


            if (!firstAccounts.length) {

                await connection.rollback();

                return res.status(404).json({
                    success: false,
                    message:
                        "No virtual account was found for this user."
                });

            }


            const firstAccount =
                firstAccounts[0];


            /*
            =====================================================
            5. FIRST ACCOUNT MUST BE ACTIVE
            =====================================================
            */

            if (
                String(firstAccount.status || "")
                    .trim()
                    .toLowerCase() !== "active"
            ) {

                await connection.rollback();

                return res.status(400).json({
                    success: false,
                    message:
                        "The first virtual account is inactive."
                });

            }


            /*
            =====================================================
            6. GET FIRST ACCOUNT BALANCE
            =====================================================
            */

            const accountBalance =
                Number(firstAccount.balance) || 0;


            /*
            =====================================================
            7. CHECK ₦3,000 BALANCE
            =====================================================
            */

            if (
                accountBalance <
                DEFAULT_CLEAR_AMOUNT
            ) {

                await connection.rollback();

                return res.status(400).json({

                    success: false,

                    message:
                        `Insufficient balance. ₦${DEFAULT_CLEAR_AMOUNT.toLocaleString()} is required to clear this default.`,

                    required:
                        DEFAULT_CLEAR_AMOUNT,

                    balance:
                        accountBalance,

                    accountno:
                        firstAccount.accountno

                });

            }


            /*
            =====================================================
            8. CALCULATE VALUES
            =====================================================
            */

            /*
             * ACTUAL MONEY REMOVED
             *
             * ₦3,000
             */

            const newBalance =
                accountBalance -
                DEFAULT_CLEAR_AMOUNT;


            /*
             * ONLY ₦1,500 COUNTS AS THRIFT CONTRIBUTION
             */

            const newAmountPaid =
                (
                    Number(subscription.amount_paid) || 0
                ) + WEEKLY_AMOUNT;


            /*
             * ONLY ₦1,500 IS ADDED TO
             * THRIFT TOTAL PAID
             */

            const newThriftTotal =
                (
                    Number(firstAccount.thrift_total_paid) || 0
                ) + WEEKLY_AMOUNT;


            /*
             * REMOVE ONE DEFAULT
             */

            const newDefaultWeeks =
                Math.max(
                    0,
                    (
                        Number(subscription.default_weeks) || 0
                    ) - 1
                );


            /*
             * REMOVE ₦1,500 FINE
             */

            const newFineAmount =
                Math.max(
                    0,
                    (
                        Number(subscription.fine_amount) || 0
                    ) - FINE_AMOUNT
                );


            /*
            =====================================================
            9. UPDATE FIRST VIRTUAL ACCOUNT
            =====================================================
            |
            | ₦3,000 is removed from balance.
            |
            | Only ₦1,500 is added to thrift_total_paid.
            |
            =====================================================
            */

            await connection.execute(
                `
                UPDATE virtual_account

                SET
                    balance = ?,
                    thrift_total_paid = ?

                WHERE
                    id = ?

                    AND

                    user_id = ?
                `,
                [
                    newBalance,
                    newThriftTotal,
                    firstAccount.id,
                    userId
                ]
            );


            /*
            =====================================================
            10. UPDATE THRIFT SUBSCRIPTION
            =====================================================
            |
            | amount_paid increases by ₦1,500.
            |
            | NOT ₦3,000.
            |
            =====================================================
            */

            let planStatus =
                String(
                    subscription.plan_status ||
                    "Active"
                );


            if (
                Number(subscription.current_weeks) >=
                MAX_WEEKS
            ) {

                planStatus =
                    "Completed";

            }


            await connection.execute(
                `
                UPDATE thrift_subscribe

                SET
                    amount_paid = ?,
                    default_weeks = ?,
                    fine_amount = ?,
                    plan_status = ?

                WHERE
                    id = ?

                    AND

                    user_id = ?
                `,
                [
                    newAmountPaid,
                    newDefaultWeeks,
                    newFineAmount,
                    planStatus,
                    thriftId,
                    userId
                ]
            );


            /*
            =====================================================
            11. CHANGE DEFAULT HISTORY TO PAID
            =====================================================
            |
            | The history amount remains ₦1,500.
            |
            | The user actually paid ₦3,000 from the account,
            | but only ₦1,500 is recorded as the thrift
            | contribution.
            |
            =====================================================
            */

            await connection.execute(
                `
                UPDATE thrift_weekly_history

                SET
                    status = 'Paid',
                    amount = ?,
                    fine_amount = 0

                WHERE
                    id = ?

                    AND

                    thrift_subscribe_id = ?

                    AND

                    user_id = ?
                `,
                [
                    WEEKLY_AMOUNT,
                    history.id,
                    thriftId,
                    userId
                ]
            );


            /*
            =====================================================
            12. COMMIT
            =====================================================
            */

            await connection.commit();


            /*
            =====================================================
            13. SUCCESS RESPONSE
            =====================================================
            */

            return res.json({

                success: true,

                message:
                    `Week ${weekNumber} default cleared successfully.`,

                thrift_id:
                    thriftId,

                week_number:
                    weekNumber,

                /*
                 * MONEY ACTUALLY DEDUCTED
                 */

                deducted_from_account:
                    DEFAULT_CLEAR_AMOUNT,

                /*
                 * AMOUNT COUNTED AS THRIFT
                 */

                thrift_contribution:
                    WEEKLY_AMOUNT,

                /*
                 * NEW SUBSCRIPTION TOTAL
                 */

                amount_paid:
                    newAmountPaid,

                /*
                 * NEW ACCOUNT BALANCE
                 */

                balance:
                    newBalance,

                /*
                 * NEW THRIFT TOTAL
                 */

                total_contribution:
                    newThriftTotal,

                default_weeks:
                    newDefaultWeeks,

                fine_amount:
                    newFineAmount,

                plan_status:
                    planStatus,

                /*
                 * SHOW WHICH ACCOUNT WAS CHARGED
                 */

                charged_account: {

                    id:
                        firstAccount.id,

                    accountno:
                        firstAccount.accountno,

                    account_name:
                        firstAccount.account_name

                }

            });


        } catch (error) {

            try {
                await connection.rollback();
            } catch (rollbackError) {
                console.error(
                    "ROLLBACK ERROR:",
                    rollbackError
                );
            }


            console.error(
                "CLEAR DEFAULT ERROR:",
                error
            );


            return res.status(500).json({

                success: false,

                message:
                    "Unable to clear thrift default.",

                error:
                    error.message

            });

        } finally {

            connection.release();

        }

    }
);








/*
|--------------------------------------------------------------------------
| CREATE USER COMPLAINT / SUPPORT TICKET
|--------------------------------------------------------------------------
|
| POST /api/complaints
|
| Authentication:
| authenticate
|
| Expected body:
|
| {
|     "category": "payment",
|     "subject": "Payment not reflecting",
|     "message": "I made a payment but it has not reflected..."
| }
|
| Categories:
| payment
| thrift
| wallet
| account
| virtual_account
| other
|
|--------------------------------------------------------------------------
*/

router.post(
    "/complaints",
    authenticate,
    async (req, res) => {

        const connection =
            await pool.getConnection();

        try {

            /*
            |--------------------------------------------------------------------------
            | GET LOGGED-IN USER ID
            |--------------------------------------------------------------------------
            */

            const userId =
                Number(
                    req.user?.id ||
                    req.auth?.id ||
                    req.user?.user_id ||
                    req.auth?.user_id
                );


            if (
                !Number.isInteger(userId) ||
                userId <= 0
            ) {

                return res.status(401).json({

                    success: false,

                    message:
                        "User authentication is required."

                });

            }


            /*
            |--------------------------------------------------------------------------
            | GET REQUEST DATA
            |--------------------------------------------------------------------------
            */

            const category =
                String(
                    req.body?.category || ""
                )
                .trim()
                .toLowerCase();


            const subject =
                String(
                    req.body?.subject || ""
                )
                .trim();


            const message =
                String(
                    req.body?.message || ""
                )
                .trim();


            /*
            |--------------------------------------------------------------------------
            | VALIDATE CATEGORY
            |--------------------------------------------------------------------------
            */

            const allowedCategories = [

                "payment",
                "thrift",
                "wallet",
                "account",
                "virtual_account",
                "other"

            ];


            if (
                !allowedCategories.includes(
                    category
                )
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Invalid complaint category."

                });

            }


            /*
            |--------------------------------------------------------------------------
            | VALIDATE SUBJECT
            |--------------------------------------------------------------------------
            */

            if (
                !subject
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Complaint subject is required."

                });

            }


            if (
                subject.length > 255
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Complaint subject must not exceed 255 characters."

                });

            }


            /*
            |--------------------------------------------------------------------------
            | VALIDATE MESSAGE
            |--------------------------------------------------------------------------
            */

            if (
                !message
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Please describe the challenge or issue you are experiencing."

                });

            }


            if (
                message.length < 10
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Please provide more details about your complaint."

                });

            }


            /*
            |--------------------------------------------------------------------------
            | VERIFY USER EXISTS
            |--------------------------------------------------------------------------
            */

            const [users] =
                await connection.query(
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


            /*
            |--------------------------------------------------------------------------
            | GENERATE TICKET NUMBER
            |--------------------------------------------------------------------------
            |
            | Example:
            |
            | BW-20260913-123456
            |
            |--------------------------------------------------------------------------
            */

            const ticketNumber =
                "BW-" +
                Date.now();


            /*
            |--------------------------------------------------------------------------
            | CREATE COMPLAINT
            |--------------------------------------------------------------------------
            */

            await connection.beginTransaction();


            const [result] =
                await connection.query(
                    `
                    INSERT INTO complaints
                    (
                        user_id,
                        ticket_number,
                        category,
                        subject,
                        message,
                        status,
                        created_at,
                        updated_at
                    )

                    VALUES
                    (
                        ?,
                        ?,
                        ?,
                        ?,
                        ?,
                        'open',
                        NOW(),
                        NOW()
                    )
                    `,
                    [
                        userId,

                        ticketNumber,

                        category,

                        subject,

                        message
                    ]
                );


            await connection.commit();


            /*
            |--------------------------------------------------------------------------
            | SUCCESS RESPONSE
            |--------------------------------------------------------------------------
            */

            return res.status(201).json({

                success: true,

                message:
                    "Your complaint has been submitted successfully. Our team will review it and respond.",

                complaint: {

                    id:
                        result.insertId,

                    ticket_number:
                        ticketNumber,

                    user_id:
                        userId,

                    category:
                        category,

                    subject:
                        subject,

                    message:
                        message,

                    status:
                        "open",

                    created_at:
                        new Date()

                },

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

                await connection.rollback();

            } catch (_) {}


            console.error(
                "CREATE COMPLAINT ERROR:",
                error
            );


            return res.status(500).json({

                success: false,

                message:
                    error.sqlMessage ||
                    error.message ||
                    "Unable to submit complaint."

            });

        } finally {

            connection.release();

        }

    }
);

/*
|--------------------------------------------------------------------------
| GET ALL DUE THRIFT
|--------------------------------------------------------------------------
|
| GET /api/admin/thrift/all-due
|
| Returns all thrift_subscribe records.
| The frontend can search by end_date.
|
|--------------------------------------------------------------------------
*/

router.get(
    "/thrift/all-due",
    authenticate,
    requireAdmin,
    async (req, res) => {

        try {

            const [records] =
                await pool.execute(`
                  SELECT
				    ts.id,
				    ts.user_id,
				    ts.virtual_account_id,
				
				    va.accountno,
				    va.account_name,
				
				    ts.plans AS plan,
				    ts.amount,
				    ts.profit,
				
				    ts.amount_paid,
				    ts.current_weeks,
				    ts.default_weeks,
				    ts.last_default_week,
				    ts.fine_amount,
				
				    ts.start_date,
				    ts.end_date,
				    ts.plan_status,
				
				    ts.created_at,
				    ts.updated_at
				
				FROM thrift_subscribe ts
				
				LEFT JOIN virtual_account va
				    ON va.id = ts.virtual_account_id
				
				ORDER BY
				    ts.end_date ASC,
				    ts.id ASC
				
				LIMIT 100;
			 `);


            return res.json({

                success: true,

                count: records.length,

                thrift: records

            });


        } catch (error) {

            console.error(
                "ADMIN ALL DUE THRIFT ERROR:",
                error
            );


            return res.status(500).json({

                success: false,

                message:
                    "Unable to load all due thrift accounts."

            });

        }

    }
);





/*
|--------------------------------------------------------------------------
| ADMIN: GET ALL CLEARANCE RECORDS
|--------------------------------------------------------------------------
| GET /api/thrift/clearance
|
| Returns ALL thrift subscriptions:
| - Cleared
| - Uncleared
| - Completed
| - Pending
|--------------------------------------------------------------------------
*/

router.get(
    "/clearances",
    authenticate,
    requireAdmin,
    async (req, res) => {
        try {
            const [rows] = await pool.query(`
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
                    ts.created_at,
                    ts.updated_at,
                    ts.default_weeks,
                    ts.last_default_week,
                    ts.clearance_fee,
                    ts.clearance_status,
                    ts.clearance_accountno,
                    ts.clearance_paid_at,

                    u.full_name,
                    u.email,
                    u.phone_number,

                    va.account_name,
                    va.balance AS account_balance,
                    va.status AS virtual_account_status

                FROM thrift_subscribe ts

                LEFT JOIN users u
                    ON u.id = ts.user_id

                LEFT JOIN virtual_account va
                    ON va.id = ts.virtual_account_id

                ORDER BY
                    ts.end_date ASC,
                    ts.id DESC
            `);

            const records = rows.map(row => {
                const clearanceStatus = String(
                    row.clearance_status || ""
                ).trim().toLowerCase();

                let status = "uncleared";

                if (
                    clearanceStatus === "cleared" ||
                    clearanceStatus === "clear" ||
                    clearanceStatus === "completed" ||
                    clearanceStatus === "paid" ||
                    clearanceStatus === "1" ||
                    clearanceStatus === "true"
                ) {
                    status = "cleared";
                }

                return {
                    id: row.id,
                    user_id: row.user_id,

                    virtual_account_number:
                        row.clearance_accountno,

                    virtual_account_id:
                        row.virtual_account_id,

                    accountno:
                        row.accountno,

                    plans:
                        row.plans,

                    amount:
                        Number(row.amount || 0),

                    amount_paid:
                        Number(row.amount_paid || 0),

                    profit:
                        Number(row.profit || 0),

                    current_weeks:
                        Number(row.current_weeks || 0),

                    default_weeks:
                        Number(row.default_weeks || 0),

                    fine_amount:
                        Number(row.fine_amount || 0),

                    start_date:
                        row.start_date,

                    end_date:
                        row.end_date,

                    plan_status:
                        row.plan_status,

                    created_at:
                        row.created_at,

                    updated_at:
                        row.updated_at,

                    last_default_week:
                        row.last_default_week,

                    clearance_fee:
                        Number(row.clearance_fee || 0),

                    clearance_status:
                        row.clearance_status,

                    // IMPORTANT:
                    // Your actual column is clearance_accountno
                    clearance_accountno:
                        row.clearance_accountno,

                    clearance_paid_at:
                        row.clearance_paid_at,

                    // User details
                    full_name:
                        row.full_name,

                    email:
                        row.email,

                    phone_number:
                        row.phone_number,

                    // Virtual account details
                    account_name:
                        row.account_name,

                    account_balance:
                        Number(row.account_balance || 0),

                    virtual_account_status:
                        row.virtual_account_status,

                    // Frontend-friendly status
                    status
                };
            });

            console.log(
                `Clearance records loaded: ${records.length}`
            );

            return res.status(200).json({
                success: true,
                count: records.length,
                data: records
            });

        } catch (error) {
            console.error(
                "GET /api/thrift/clearance ERROR:",
                error
            );

            return res.status(500).json({
                success: false,
                message: "Failed to load clearance records",
                error: error.message
            });
        }
    }
);




module.exports = router;