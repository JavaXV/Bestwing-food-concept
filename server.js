/*
|--------------------------------------------------------------------------
| LOAD ENVIRONMENT VARIABLES
|--------------------------------------------------------------------------
*/

require("dotenv").config();


/*
|--------------------------------------------------------------------------
| IMPORT EXPRESS
|--------------------------------------------------------------------------
*/

const express = require("express");


/*
|--------------------------------------------------------------------------
| IMPORT PATH
|--------------------------------------------------------------------------
*/

const path = require("path");


/*
|--------------------------------------------------------------------------
| IMPORT BCRYPT
|--------------------------------------------------------------------------
*/

const bcrypt = require("bcryptjs");


/*
|--------------------------------------------------------------------------
| IMPORT DATABASE CONNECTION
|--------------------------------------------------------------------------
*/

const pool = require("./config/db");


/*
|--------------------------------------------------------------------------
| IMPORT ROUTES
|--------------------------------------------------------------------------
*/

const auth = require("./routes/auth");

const payment = require("./routes/payment");

const user = require("./routes/user");

const admin = require("./routes/admin");

const walletRoutes = require("./routes/wallet");

const dashboardRoutes = require("./routes/dashboard");

const thriftRoutes = require("./routes/thrift");

const complaintsRoutes = require("./routes/complaints");


/*
|--------------------------------------------------------------------------
| CREATE EXPRESS APPLICATION
|--------------------------------------------------------------------------
*/

const app = express();


/*
|--------------------------------------------------------------------------
| BODY PARSERS
|--------------------------------------------------------------------------
*/

app.use(express.json());

app.use(
    express.urlencoded({
        extended: true
    })
);


/*
|--------------------------------------------------------------------------
| SERVE PUBLIC FILES
|--------------------------------------------------------------------------
*/

app.use(
    express.static(
        path.join(__dirname, "public")
    )
);


/*
|--------------------------------------------------------------------------
| API ROUTES
|--------------------------------------------------------------------------
|
| AUTH
| /api/auth/*
|
*/

app.use(
    "/api/auth",
    auth
);


/*
|--------------------------------------------------------------------------
| PAYMENT ROUTES
|--------------------------------------------------------------------------
|
| /api/payments/*
|
*/

app.use(
    "/api/payment",
    payment
);


app.use(
    "/api/payments",
    payment
);


app.use(
    "/api/thrift",
    thriftRoutes
);

app.use("/api/complaints", complaintsRoutes);


/*
|--------------------------------------------------------------------------
| USER ROUTES
|--------------------------------------------------------------------------
|
| /api/user/*
|
*/

app.use(
    "/api/user",
    user
);


/*
|--------------------------------------------------------------------------
| ADMIN ROUTES
|--------------------------------------------------------------------------
|
| /api/admin/*
|
*/

app.use(
    "/api/admin",
    admin
);


/*
|--------------------------------------------------------------------------
| DASHBOARD ROUTES
|--------------------------------------------------------------------------
|
| /api/dashboard/*
|
*/

app.use(
    "/api/dashboard",
    dashboardRoutes
);


/*
|--------------------------------------------------------------------------
| WALLET ROUTES
|--------------------------------------------------------------------------
|
| /api/wallet/*
|
*/

app.use(
    "/api/wallet",
    walletRoutes
);


/*
|--------------------------------------------------------------------------
| HEALTH CHECK
|--------------------------------------------------------------------------
*/

app.get(
    "/health",
    (req, res) => {

        return res.json({
            success: true,
            message: "API is running"
        });

    }
);


/*
|--------------------------------------------------------------------------
| API 404 HANDLER
|--------------------------------------------------------------------------
|
| IMPORTANT:
| Always return JSON for unknown API routes.
|
| This prevents:
|
| Unexpected token '<'
|
| because Express would otherwise return an HTML 404 page.
|
|--------------------------------------------------------------------------
*/

app.use(
    "/api",
    (req, res) => {

        return res.status(404).json({

            success: false,

            message: "API route not found",

            method: req.method,

            path: req.originalUrl

        });

    }
);


/*
|--------------------------------------------------------------------------
| HOME PAGE
|--------------------------------------------------------------------------
*/

app.get(
    "/",
    (req, res) => {

        return res.sendFile(
            path.join(
                __dirname,
                "public",
                "register.html"
            )
        );

    }
);


/*
|--------------------------------------------------------------------------
| SEED DEFAULT ADMIN
|--------------------------------------------------------------------------
*/

async function seedAdmin() {

    /*
    |--------------------------------------------------------------------------
    | CHECK ENVIRONMENT VARIABLES
    |--------------------------------------------------------------------------
    */

    if (
        !process.env.ADMIN_PHONE ||
        !process.env.ADMIN_PASSWORD
    ) {

        return;

    }


    /*
    |--------------------------------------------------------------------------
    | CHECK EXISTING ADMIN
    |--------------------------------------------------------------------------
    */

    const [rows] = await pool.query(
        `
        SELECT id
        FROM admin_users
        WHERE phone_number = ?
        LIMIT 1
        `,
        [
            process.env.ADMIN_PHONE
        ]
    );


    /*
    |--------------------------------------------------------------------------
    | CREATE ADMIN
    |--------------------------------------------------------------------------
    */

    if (!rows.length) {

        const hash = await bcrypt.hash(
            process.env.ADMIN_PASSWORD,
            12
        );


        await pool.query(
            `
            INSERT INTO admin_users
            (
                phone_number,
                password_hash
            )
            VALUES
            (
                ?,
                ?
            )
            `,
            [
                process.env.ADMIN_PHONE,
                hash
            ]
        );


        console.log(
            "Default admin created:",
            process.env.ADMIN_PHONE
        );

    }

}


/*
|--------------------------------------------------------------------------
| GLOBAL ERROR HANDLER
|--------------------------------------------------------------------------
|
| IMPORTANT:
| API errors should also return JSON instead of HTML.
|
|--------------------------------------------------------------------------
*/

app.use(
    (err, req, res, next) => {

        console.error(
            "SERVER ERROR:",
            err
        );


        if (req.originalUrl.startsWith("/api/")) {

            return res.status(500).json({

                success: false,

                message: "Internal server error",

                error:
                    process.env.NODE_ENV === "development"
                        ? err.message
                        : undefined

            });

        }


        return res.status(500).send(
            "Internal server error"
        );

    }
);


/*
|--------------------------------------------------------------------------
| SERVER PORT
|--------------------------------------------------------------------------
*/

const port =
    process.env.PORT || 3000;


/*
|--------------------------------------------------------------------------
| START SERVER
|--------------------------------------------------------------------------
*/

app.listen(
    port,
    async () => {

        try {

            await seedAdmin();

        } catch (e) {

            console.error(
                "Admin seed error:",
                e.message
            );

        }


        console.log(
            `Server running on port ${port}`
        );

        console.log(
            `Health check: /health`
        );

        console.log(
            `Payment API: /api/payments`
        );

    }
);
