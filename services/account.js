const pool = require('../config/db');


/*
|--------------------------------------------------------------------------
| GENERATE UNIQUE 10-DIGIT ACCOUNT NUMBER
|--------------------------------------------------------------------------
|
| Generates a random 10-digit account number and checks the
| virtual_account table to make sure it is unique.
|
|--------------------------------------------------------------------------
*/

async function generateAccountNumber(conn) {

    /*
    |--------------------------------------------------------------------------
    | TRY UP TO 30 TIMES
    |--------------------------------------------------------------------------
    */

    for (
        let i = 0;
        i < 30;
        i++
    ) {

        /*
        |--------------------------------------------------------------------------
        | GENERATE RANDOM 10-DIGIT NUMBER
        |--------------------------------------------------------------------------
        */

        const number = String(

            Math.floor(
                1000000000 +
                Math.random() * 9000000000
            )

        );


        /*
        |--------------------------------------------------------------------------
        | CHECK WHETHER ACCOUNT NUMBER ALREADY EXISTS
        |--------------------------------------------------------------------------
        */

        const [rows] = await conn.query(

            `
            SELECT id
            FROM virtual_account
            WHERE accountno = ?
            LIMIT 1
            `,

            [
                number
            ]

        );


        /*
        |--------------------------------------------------------------------------
        | NUMBER IS AVAILABLE
        |--------------------------------------------------------------------------
        */

        if (!rows.length) {

            return number;

        }

    }


    /*
    |--------------------------------------------------------------------------
    | COULD NOT GENERATE UNIQUE ACCOUNT NUMBER
    |--------------------------------------------------------------------------
    */

    throw new Error(
        'Unable to generate unique account number'
    );

}


/*
|--------------------------------------------------------------------------
| ACTIVATE USER
|--------------------------------------------------------------------------
|
| Called after registration payment has been approved.
|
| It:
|
| 1. Finds and locks the user
| 2. Marks payment_status as paid
| 3. Marks account_status as active
| 4. Checks whether the user already has a virtual account
| 5. Creates one if necessary
| 6. Returns the virtual account
|
|--------------------------------------------------------------------------
*/

async function activateUser(userId) {

    /*
    |--------------------------------------------------------------------------
    | GET DATABASE CONNECTION
    |--------------------------------------------------------------------------
    */

    const conn =
        await pool.getConnection();


    try {

        /*
        |--------------------------------------------------------------------------
        | START TRANSACTION
        |--------------------------------------------------------------------------
        */

        await conn.beginTransaction();


        /*
        |--------------------------------------------------------------------------
        | FIND AND LOCK USER
        |--------------------------------------------------------------------------
        */

        const [users] = await conn.query(

            `
            SELECT *
            FROM users
            WHERE id = ?
            LIMIT 1
            FOR UPDATE
            `,

            [
                userId
            ]

        );


        /*
        |--------------------------------------------------------------------------
        | USER NOT FOUND
        |--------------------------------------------------------------------------
        */

        if (!users.length) {

            throw new Error(
                'User not found'
            );

        }


        /*
        |--------------------------------------------------------------------------
        | USER INFORMATION
        |--------------------------------------------------------------------------
        */

        const user =
            users[0];


        /*
        |--------------------------------------------------------------------------
        | ACTIVATE USER
        |--------------------------------------------------------------------------
        |
        | Always set both values.
        |
        | This is important because an account could already be active
        | while payment_status is still unpaid/pending.
        |
        */

        await conn.query(

            `
            UPDATE users

            SET
                payment_status = 'paid',
                account_status = 'active'

            WHERE id = ?
            `,

            [
                userId
            ]

        );


        /*
        |--------------------------------------------------------------------------
        | CHECK EXISTING VIRTUAL ACCOUNT
        |--------------------------------------------------------------------------
        */

        const [existing] =
            await conn.query(

                `
                SELECT *
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
        | EXISTING ACCOUNT
        |--------------------------------------------------------------------------
        */

        if (existing.length) {

            await conn.commit();

            return existing[0];

        }


        /*
        |--------------------------------------------------------------------------
        | GENERATE NEW ACCOUNT NUMBER
        |--------------------------------------------------------------------------
        */

        const accountno =
            await generateAccountNumber(
                conn
            );


        /*
        |--------------------------------------------------------------------------
        | CREATE VIRTUAL ACCOUNT
        |--------------------------------------------------------------------------
        */

        await conn.query(

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
                0.00
            )
            `,

            [

                userId,

                accountno,

                user.full_name

            ]

        );


        /*
        |--------------------------------------------------------------------------
        | GET CREATED ACCOUNT
        |--------------------------------------------------------------------------
        */

        const [created] =
            await conn.query(

                `
                SELECT *
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


        /*
        |--------------------------------------------------------------------------
        | MAKE SURE ACCOUNT WAS CREATED
        |--------------------------------------------------------------------------
        */

        if (!created.length) {

            throw new Error(
                'Virtual account could not be created'
            );

        }


        /*
        |--------------------------------------------------------------------------
        | COMMIT
        |--------------------------------------------------------------------------
        */

        await conn.commit();


        /*
        |--------------------------------------------------------------------------
        | RETURN ACCOUNT
        |--------------------------------------------------------------------------
        */

        return created[0];


    } catch (e) {

        /*
        |--------------------------------------------------------------------------
        | ROLLBACK
        |--------------------------------------------------------------------------
        */

        try {

            await conn.rollback();

        } catch (_) {}

        /*
        |--------------------------------------------------------------------------
        | SEND ERROR BACK
        |--------------------------------------------------------------------------
        */

        throw e;


    } finally {

        /*
        |--------------------------------------------------------------------------
        | RELEASE CONNECTION
        |--------------------------------------------------------------------------
        */

        conn.release();

    }

}


/*
|--------------------------------------------------------------------------
| EXPORT
|--------------------------------------------------------------------------
*/

module.exports = {

    activateUser

};