const API_BASE = "/api";

function getToken() {
    return localStorage.getItem("token");
}

function authHeaders() {

    const token = getToken();

    if (!token) {
        window.location.href = "login.html";
        return {};
    }

    return {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + token
    };
}


/*
|--------------------------------------------------------------------------
| FUND WALLET WITH VIRTUAL ACCOUNT
|--------------------------------------------------------------------------
*/

document
    .getElementById("paystackFundBtn")
    ?.addEventListener("click", async function () {

        const accountSelect =
            document.getElementById("fundWalletAccountNo");

        const amountInput =
            document.getElementById("fundWalletAmount");

        const accountNo =
            accountSelect?.value?.trim();

        const amount =
            Number(amountInput?.value);

        if (!accountNo) {

            alert(
                "Please select the virtual account to fund."
            );

            return;
        }

        if (!amount || amount <= 0) {

            alert(
                "Please enter a valid amount."
            );

            return;
        }

        const token = getToken();

        if (!token) {

            alert(
                "Your login session has expired. Please login again."
            );

            window.location.href =
                "login.html";

            return;
        }


        /*
        |--------------------------------------------------------------------------
        | SHOW PROCESSING
        |--------------------------------------------------------------------------
        */

        const button = this;

        button.disabled = true;

        const originalText =
            button.innerHTML;

        button.innerHTML =
            "Processing...";


        try {

            const response = await fetch(
                API_BASE +
                "/payments/fund/initialize",
                {
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json",

                        "Authorization":
                            "Bearer " + token
                    },

                    body: JSON.stringify({
                        accountno: accountNo,
                        amount: amount
                    })
                }
            );


            /*
            |--------------------------------------------------------------------------
            | DON'T ASSUME RESPONSE IS JSON
            |--------------------------------------------------------------------------
            */

            const contentType =
                response.headers.get(
                    "content-type"
                ) || "";


            if (!contentType.includes(
                "application/json"
            )) {

                const text =
                    await response.text();

                console.error(
                    "NON-JSON PAYMENT RESPONSE:",
                    text
                );

                throw new Error(
                    "Payment server returned HTML instead of JSON. " +
                    "Check the payment route URL."
                );
            }


            const data =
                await response.json();


            if (!response.ok) {

                if (
                    response.status === 401
                ) {

                    localStorage.removeItem(
                        "token"
                    );

                    window.location.href =
                        "login.html";

                    return;
                }

                throw new Error(
                    data.message ||
                    "Unable to initialize payment."
                );
            }


            if (!data.success) {

                throw new Error(
                    data.message ||
                    "Payment initialization failed."
                );
            }


            /*
            |--------------------------------------------------------------------------
            | PAYSTACK
            |--------------------------------------------------------------------------
            */

            if (
                data.authorization_url
            ) {

                window.location.href =
                    data.authorization_url;

                return;
            }


            if (
                data.data &&
                data.data.authorization_url
            ) {

                window.location.href =
                    data.data.authorization_url;

                return;
            }


            throw new Error(
                "Paystack authorization URL was not returned."
            );

        } catch (error) {

            console.error(
                "FUND WALLET ERROR:",
                error
            );

            alert(
                error.message ||
                "Unable to process payment."
            );

        } finally {

            button.disabled = false;

            button.innerHTML =
                originalText;
        }

    });





        /*
        |--------------------------------------------------------------------------
        | REDIRECT CALLBACK TO process.env.PAYSTACK_CALLBACK_URL_PA
        |--------------------------------------------------------------------------
        */

const paystackResponse =
    await axios.post(
        "https://api.paystack.co/transaction/initialize",
        {
            email,

            amount:
                Math.round(
                    amountNGN * 100
                ),

            reference,

            callback_url:
                process.env.PAYSTACK_CALLBACK_URL_PAY,

            metadata: {

                payment_type:
                    "wallet_funding",

                user_id:
                    userId,

                account_id:
                    account.id,

                accountno:
                    account.accountno,

                account_name:
                    account.account_name
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

 /*
        |--------------------------------------------------------------------------
        | SWITCH switchAccount
        |--------------------------------------------------------------------------
        */


async function switchAccount(accountno) {

    const token =
        localStorage.getItem("token");

    if (!token) {
        window.location.href = "/login.html";
        return;
    }

    try {

        /*
        |--------------------------------------------------------------------------
        | SAVE SELECTED ACCOUNT
        |--------------------------------------------------------------------------
        */

        localStorage.setItem(
            "selectedAccountNo",
            accountno
        );


        /*
        |--------------------------------------------------------------------------
        | RELOAD DASHBOARD
        |--------------------------------------------------------------------------
        */

        window.location.reload();

    } catch (error) {

        console.error(
            "ACCOUNT SWITCH ERROR:",
            error
        );

        alert(
            "Unable to switch account."
        );

    }

}
