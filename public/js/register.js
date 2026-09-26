document
    .getElementById('registerForm')
    .addEventListener(
        'submit',
        async (e) => {


            /*
            |--------------------------------------------------------------------------
            | PREVENT DEFAULT FORM SUBMISSION
            |--------------------------------------------------------------------------
            */

            e.preventDefault();


            /*
            |--------------------------------------------------------------------------
            | GET MESSAGE ELEMENT
            |--------------------------------------------------------------------------
            */

            const msg =
                document.getElementById(
                    'msg'
                );


            /*
            |--------------------------------------------------------------------------
            | GET FORM DATA
            |--------------------------------------------------------------------------
            */

            const body =
                Object.fromEntries(

                    new FormData(
                        e.target
                    )

                );


            try {


                /*
                |--------------------------------------------------------------------------
                | SEND REGISTRATION REQUEST
                |--------------------------------------------------------------------------
                |
                | Registration does NOT require JWT.
                |
                */

                const r = await fetch(

                    '/api/auth/register',

                    {

                        method: 'POST',

                        headers: {

                            'Content-Type':
                                'application/json'

                        },

                        body:
                            JSON.stringify(
                                body
                            )

                    }

                );


                /*
                |--------------------------------------------------------------------------
                | READ API RESPONSE
                |--------------------------------------------------------------------------
                */

                const d =
                    await r.json();


                /*
                |--------------------------------------------------------------------------
                | CHECK API RESPONSE
                |--------------------------------------------------------------------------
                */

                if (!r.ok) {

                    throw new Error(
                        d.message
                    );

                }


                /*
                |--------------------------------------------------------------------------
                | SAVE USER ID
                |--------------------------------------------------------------------------
                |
                | The payment page uses this ID to initialize
                | the Paystack or manual payment.
                |
                */

                localStorage.setItem(

                    'registration_user_id',

                    d.user_id

                );


                /*
                |--------------------------------------------------------------------------
                | REDIRECT TO PAYMENT PAGE
                |--------------------------------------------------------------------------
                */

                location.href =
                    '/payment.html';


            } catch (err) {


                /*
                |--------------------------------------------------------------------------
                | DISPLAY REGISTRATION ERROR
                |--------------------------------------------------------------------------
                */

                msg.innerHTML =

                    `

                    <div class="alert alert-danger">

                        ${err.message}

                    </div>

                    `;

            }

        }

    );