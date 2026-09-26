const jwt = require("jsonwebtoken");

require("dotenv").config();


/*
|--------------------------------------------------------------------------
| AUTHENTICATE USER
|--------------------------------------------------------------------------
*/

function authenticate(req, res, next) {

    try {

        /*
        |--------------------------------------------------------------------------
        | JWT SECRET
        |--------------------------------------------------------------------------
        */

        const secret =
            process.env.JWT_SECRET;


        if (!secret) {

            console.error(
                "JWT_SECRET is missing from .env"
            );

            return res.status(500).json({

                success: false,

                message:
                    "Authentication configuration error"

            });

        }


        /*
        |--------------------------------------------------------------------------
        | GET AUTHORIZATION HEADER
        |--------------------------------------------------------------------------
        */

        const authHeader =
            req.get("Authorization");


        /*
        |--------------------------------------------------------------------------
        | CHECK HEADER
        |--------------------------------------------------------------------------
        */

        if (!authHeader) {

            console.log(
                "AUTH FAILED: Authorization header is missing",
                {
                    method: req.method,
                    url: req.originalUrl
                }
            );

            // return res.status(401).json({

            //     success: false,

            //     message:
            //         "Authorization token is required"

            // });

        }


        /*
        |--------------------------------------------------------------------------
        | CHECK BEARER FORMAT
        |--------------------------------------------------------------------------
        */

        if (
            !authHeader
                .trim()
                .toLowerCase()
                .startsWith("bearer ")
        ) {

            return res.status(401).json({

                success: false,

                message:
                    "Invalid Authorization header"

            });

        }


        /*
        |--------------------------------------------------------------------------
        | GET TOKEN
        |--------------------------------------------------------------------------
        */

        const token =
            authHeader
                .trim()
                .substring(7)
                .trim();


        if (!token) {

            return res.status(401).json({

                success: false,

                message:
                    "Authorization token is missing"

            });

        }


        /*
        |--------------------------------------------------------------------------
        | VERIFY TOKEN
        |--------------------------------------------------------------------------
        */

        const decoded =
            jwt.verify(
                token,
                secret
            );


        /*
        |--------------------------------------------------------------------------
        | CHECK USER ID
        |--------------------------------------------------------------------------
        */

        if (
            !decoded ||
            !decoded.id
        ) {

            // return res.status(401).json({

            //     success: false,

            //     message:
            //         "Invalid authentication token"

            // });

        }


        /*
        |--------------------------------------------------------------------------
        | NORMALIZE USER
        |--------------------------------------------------------------------------
        */

        const user = {

            ...decoded,

            id:
                Number(decoded.id)

        };


        if (
            !Number.isInteger(user.id) ||
            user.id <= 0
        ) {

            return res.status(401).json({

                success: false,

                message:
                    "Invalid user ID in authentication token"

            });

        }


        /*
        |--------------------------------------------------------------------------
        | SAVE USER
        |--------------------------------------------------------------------------
        */

        req.user =
            user;

        req.auth =
            user;


        /*
        |--------------------------------------------------------------------------
        | DEBUG
        |--------------------------------------------------------------------------
        */

        console.log(
            "AUTHENTICATED USER:",
            {
                id:
                    user.id,

                phone_number:
                    user.phone_number || null,

                isAdmin:
                    user.isAdmin || false
            }
        );


        /*
        |--------------------------------------------------------------------------
        | CONTINUE
        |--------------------------------------------------------------------------
        */

        next();


    } catch (error) {

        console.error(
            "JWT ERROR:",
            error.message
        );


        if (
            error.name ===
            "TokenExpiredError"
        ) {

            return res.status(401).json({

                success: false,

                message:
                    "Session expired. Please login again."

            });

        }


        // return res.status(401).json({

        //     success: false,

        //     message:
        //         "Invalid authentication token"

        // });

    }

}


/*
|--------------------------------------------------------------------------
| REQUIRE ADMIN
|--------------------------------------------------------------------------
*/

function requireAdmin(
    req,
    res,
    next
) {

    if (!req.user) {

        return res.status(401).json({

            success: false,

            message:
                "Authentication required"

        });

    }


    const isAdmin =
        req.user.isAdmin === true ||
        req.user.isAdmin === 1 ||
        req.user.isAdmin === "1";


    if (!isAdmin) {

        return res.status(403).json({

            success: false,

            message:
                "Admin access required"

        });

    }


    next();

}


module.exports = {

    authenticate,

    requireAdmin

};