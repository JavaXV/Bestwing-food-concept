/*
|--------------------------------------------------------------------------
| MANUAL BANK TRANSFER BUTTON
|--------------------------------------------------------------------------
*/

document.addEventListener("DOMContentLoaded", function () {

    const button = document.getElementById(
        "submitManualPaymentBtn"
    );


    /*
    |--------------------------------------------------------------------------
    | CHECK BUTTON
    |--------------------------------------------------------------------------
    */

    if (!button) {

        console.error(
            "ERROR: submitManualPaymentBtn was not found."
        );

        return;
    }


    console.log(
        "Manual payment button found successfully."
    );


    /*
    |--------------------------------------------------------------------------
    | BUTTON CLICK
    |--------------------------------------------------------------------------
    */

    button.addEventListener("click", async function (event) {

        event.preventDefault();

        console.log(
            "I Have Made The Transfer button clicked."
        );


        /*
        |--------------------------------------------------------------------------
        | TOKEN
        |--------------------------------------------------------------------------
        */

        const token =
            localStorage.getItem("token");


        if (!token) {

            alert(
                "Your session has expired. Please login again."
            );

            window.location.href =
                "/login.html";

            return;
        }


        /*
        |--------------------------------------------------------------------------
        | SELECTED VIRTUAL ACCOUNT
        |--------------------------------------------------------------------------
        */

        const accountSelect =
            document.getElementById(
                "fundWalletAccountNo"
            );


        if (!accountSelect) {

            alert(
                "Virtual account selector was not found."
            );

            return;
        }


        const accountno =
            accountSelect.value.trim();


        if (!accountno) {

            alert(
                "Please select the virtual account you want to fund."
            );

            return;
        }


        /*
        |--------------------------------------------------------------------------
        | AMOUNT
        |--------------------------------------------------------------------------
        */

        const amountInput =
            document.getElementById(
                "fundWalletAmount"
            );


        if (!amountInput) {

            alert(
                "Amount field was not found."
            );

            return;
        }


        const amount =
            Number(amountInput.value);


        if (!Number.isFinite(amount) || amount < 100) {

            alert(
                "Please enter a valid amount of at least ₦100."
            );

            amountInput.focus();

            return;
        }


        /*
        |--------------------------------------------------------------------------
        | CONFIRM TRANSFER
        |--------------------------------------------------------------------------
        */

        const confirmed = confirm(
            "Have you made the bank transfer of ₦" +
            amount.toLocaleString("en-NG", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            }) +
            "?"
        );


        if (!confirmed) {

            return;
        }


        /*
        |--------------------------------------------------------------------------
        | DISABLE BUTTON
        |--------------------------------------------------------------------------
        */

        button.disabled = true;

        button.innerHTML =
            '<span class="spinner-border spinner-border-sm me-2"></span>' +
            'Submitting...';


        try {

            /*
            |--------------------------------------------------------------------------
            | SEND MANUAL PAYMENT
            |--------------------------------------------------------------------------
            */

            const response =
                await fetch(
                    "/api/wallet/manual",
                    {
                        method: "POST",

                        headers: {
                            "Content-Type": "application/json",
                            "Authorization":
                                "Bearer " + token
                        },

                        body: JSON.stringify({

                            amount: amount,

                            accountno: accountno,

                            payment_method:
                                "BANK_TRANSFER"

                        })
                    }
                );


            /*
            |--------------------------------------------------------------------------
            | GET RESPONSE
            |--------------------------------------------------------------------------
            */

            const responseText =
                await response.text();


            console.log(
                "Wallet manual payment response:",
                responseText
            );


            let data;


            try {

                data =
                    JSON.parse(responseText);

            } catch (jsonError) {

                console.error(
                    "Invalid server response:",
                    responseText
                );

                throw new Error(
                    "Server returned an invalid response. HTTP " +
                    response.status
                );
            }


            /*
            |--------------------------------------------------------------------------
            | AUTHENTICATION ERROR
            |--------------------------------------------------------------------------
            */

            if (response.status === 401) {

                localStorage.removeItem("token");

                localStorage.removeItem("user");

                window.location.href =
                    "/login.html";

                return;
            }


            /*
            |--------------------------------------------------------------------------
            | SERVER ERROR
            |--------------------------------------------------------------------------
            */

            if (!response.ok) {

                throw new Error(
                    data.message ||
                    "Unable to submit manual bank payment."
                );
            }


            /*
            |--------------------------------------------------------------------------
            | APPLICATION ERROR
            |--------------------------------------------------------------------------
            */

            if (data.success === false) {

                throw new Error(
                    data.message ||
                    "Manual bank payment was not submitted."
                );
            }


            /*
            |--------------------------------------------------------------------------
            | SUCCESS
            |--------------------------------------------------------------------------
            */

            alert(
                data.message ||
                "Your manual bank transfer has been submitted successfully and is awaiting approval."
            );


            /*
            |--------------------------------------------------------------------------
            | HIDE MANUAL PAYMENT BOX
            |--------------------------------------------------------------------------
            */

            const manualBox =
                document.getElementById(
                    "manualPaymentBox"
                );


            if (manualBox) {

                manualBox.classList.add(
                    "d-none"
                );
            }


            /*
            |--------------------------------------------------------------------------
            | RESET AMOUNT
            |--------------------------------------------------------------------------
            */

            amountInput.value = "";


            const amountDisplay =
                document.getElementById(
                    "manualAmountDisplay"
                );


            if (amountDisplay) {

                amountDisplay.textContent =
                    "0.00";
            }


            /*
            |--------------------------------------------------------------------------
            | CLOSE FUND WALLET MODAL
            |--------------------------------------------------------------------------
            */

            const modalElement =
                document.getElementById(
                    "fundWalletModal"
                );


            if (
                modalElement &&
                typeof bootstrap !== "undefined"
            ) {

                const modal =
                    bootstrap.Modal.getInstance(
                        modalElement
                    );


                if (modal) {

                    modal.hide();
                }
            }


        } catch (error) {

            console.error(
                "MANUAL BANK PAYMENT ERROR:",
                error
            );


            alert(
                error.message ||
                "An error occurred while submitting the manual bank transfer."
            );


        } finally {

            /*
            |--------------------------------------------------------------------------
            | RESTORE BUTTON
            |--------------------------------------------------------------------------
            */

            button.disabled = false;

            button.innerHTML =
                '<i class="bi bi-check-circle me-2"></i>' +
                'I Have Made The Transfer';
        }

    });

});


/*
|--------------------------------------------------------------------------
| GLOBAL CURRENT ACCOUNT
|--------------------------------------------------------------------------
*/

let currentUser = null;

let currentAccount = null;


/*
|--------------------------------------------------------------------------
| GET TOKEN
|--------------------------------------------------------------------------
*/

function getToken() {

    return localStorage.getItem(
        "token"
    );

}


/*
|--------------------------------------------------------------------------
| LOAD USER
|--------------------------------------------------------------------------
*/

async function loadDashboardUser() {

    const token =
        getToken();


    if (!token) {

        window.location.href =
            "login.html";

        return;

    }


    try {

        const response =
            await fetch(
                "/api/auth/me",
                {
                    method: "GET",

                    headers: {

                        "Content-Type":
                            "application/json",

                        "Authorization":
                            "Bearer " +
                            token

                    }

                }
            );


        if (
            response.status === 401
        ) {

            localStorage.removeItem(
                "token"
            );

            localStorage.removeItem(
                "user"
            );

            window.location.href =
                "login.html";

            return;

        }


        const data =
            await response.json();


        if (!data.success) {

            throw new Error(
                data.message ||
                "Unable to load user"
            );

        }


        currentUser =
            data.user;


        /*
        |--------------------------------------------------------------------------
        | SAVE USER
        |--------------------------------------------------------------------------
        */

        localStorage.setItem(
            "user",
            JSON.stringify(
                currentUser
            )
        );


        /*
        |--------------------------------------------------------------------------
        | LOAD ALL ACCOUNTS
        |--------------------------------------------------------------------------
        */

        await loadAccounts();


    } catch (error) {

        console.error(
            "Dashboard user error:",
            error
        );

        alert(
            "Unable to load your account information."
        );

    }

}


/*
|--------------------------------------------------------------------------
| LOAD ALL VIRTUAL ACCOUNTS
|--------------------------------------------------------------------------
*/

async function loadAccounts() {

    const token =
        getToken();


    try {

        const response =
            await fetch(
                "/api/auth/accounts",
                {

                    method: "GET",

                    headers: {

                        "Content-Type":
                            "application/json",

                        "Authorization":
                            "Bearer " +
                            token

                    }

                }
            );


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


        const data =
            await response.json();


        if (!data.success) {

            throw new Error(
                data.message ||
                "Unable to load accounts"
            );

        }


        /*
        |--------------------------------------------------------------------------
        | STORE ACCOUNTS
        |--------------------------------------------------------------------------
        */

        const accounts =
            data.accounts || [];


        populateAccountSwitcher(
            accounts
        );


    } catch (error) {

        console.error(
            "Accounts error:",
            error
        );


        const switcher =
            document.getElementById(
                "accountSwitcher"
            );


        switcher.innerHTML = "";

        const option =
            document.createElement(
                "option"
            );

        option.value = "";

        option.textContent =
            "Unable to load accounts";

        switcher.appendChild(
            option
        );

    }

}


/*
|--------------------------------------------------------------------------
| POPULATE SWITCHER
|--------------------------------------------------------------------------
*/

function populateAccountSwitcher(
    accounts
) {

    const switcher =
        document.getElementById(
            "accountSwitcher"
        );


    switcher.innerHTML = "";


    /*
    |--------------------------------------------------------------------------
    | NO ACCOUNTS
    |--------------------------------------------------------------------------
    */

    if (
        !accounts.length
    ) {

        const option =
            document.createElement(
                "option"
            );

        option.value = "";

        option.textContent =
            "No account found";

        switcher.appendChild(
            option
        );

        return;

    }


    /*
    |--------------------------------------------------------------------------
    | GET SAVED ACCOUNT
    |--------------------------------------------------------------------------
    */

    const savedAccount =
        JSON.parse(
            localStorage.getItem(
                "selectedAccount"
            ) || "null"
        );


    /*
    |--------------------------------------------------------------------------
    | ADD EVERY ACCOUNT
    |--------------------------------------------------------------------------
    */

    accounts.forEach(
        function(account) {

            /*
            |--------------------------------------------------------------------------
            | ACCOUNT NUMBER COMES FROM virtual_account
            |--------------------------------------------------------------------------
            */

            const accountNo =
                account.accountno;


            /*
            |--------------------------------------------------------------------------
            | USER ID
            |--------------------------------------------------------------------------
            */

            const userId =
                account.user_id;


            /*
            |--------------------------------------------------------------------------
            | CONCATENATE ID + ACCOUNT NUMBER
            |--------------------------------------------------------------------------
            |
            | Example:
            |
            | 25-1234567890
            |--------------------------------------------------------------------------
            */

            const uniqueAccountId =
                userId +
                "-" +
                accountNo;


            /*
            |--------------------------------------------------------------------------
            | CREATE OPTION
            |--------------------------------------------------------------------------
            */

            const option =
                document.createElement(
                    "option"
                );


            option.value =
                uniqueAccountId;


            /*
            |--------------------------------------------------------------------------
            | DISPLAY ACCOUNT NUMBER
            |--------------------------------------------------------------------------
            */

            option.textContent =
                account.accountno;


            /*
            |--------------------------------------------------------------------------
            | STORE ACCOUNT INFORMATION
            |--------------------------------------------------------------------------
            */

            option.dataset.userId =
                userId;

            option.dataset.accountNo =
                accountNo;


            /*
            |--------------------------------------------------------------------------
            | RESTORE PREVIOUS ACCOUNT
            |--------------------------------------------------------------------------
            */

            if (
                savedAccount &&
                savedAccount.uniqueAccountId ===
                    uniqueAccountId
            ) {

                option.selected =
                    true;

            }


            switcher.appendChild(
                option
            );

        }
    );


    /*
    |--------------------------------------------------------------------------
    | DETERMINE SELECTED ACCOUNT
    |--------------------------------------------------------------------------
    */

    let selectedOption =
        switcher.options[
            switcher.selectedIndex
        ];


    if (
        !selectedOption
    ) {

        selectedOption =
            switcher.options[0];

        selectedOption.selected =
            true;

    }


    /*
    |--------------------------------------------------------------------------
    | LOAD SELECTED ACCOUNT
    |--------------------------------------------------------------------------
    */

    if (
        selectedOption &&
        selectedOption.dataset.accountNo
    ) {

        loadSelectedAccount(
            selectedOption.dataset.accountNo
        );

    }

}


/*
|--------------------------------------------------------------------------
| SWITCH ACCOUNT
|--------------------------------------------------------------------------
*/

document
    .getElementById("accountSwitcher")
    ?.addEventListener("change", function () {

        const accountno = String(this.value || "").trim();

        if (!accountno) {
            return;
        }

        // Save the selected virtual account
        localStorage.setItem(
            "selectedAccountNo",
            accountno
        );

        console.log(
            "ACCOUNT SWITCHED TO:",
            accountno
        );

        // Reload the entire dashboard
        window.location.reload();
    });




/*
|--------------------------------------------------------------------------
| UPDATE DASHBOARD ACCOUNT
|--------------------------------------------------------------------------
|
| These IDs should correspond to the elements in your dashboard.
|--------------------------------------------------------------------------
*/

function updateDashboard(
    account
) {

    /*
    |--------------------------------------------------------------------------
    | ACCOUNT NUMBER
    |--------------------------------------------------------------------------
    */

    const accountNumber =
        document.getElementById(
            "accountNumber"
        );


    if (accountNumber) {

        accountNumber.textContent =
            account.accountno || "";

    }


    /*
    |--------------------------------------------------------------------------
    | ACCOUNT NAME
    |--------------------------------------------------------------------------
    */

    const accountName =
        document.getElementById(
            "accountName"
        );


    if (accountName) {

        accountName.textContent =
            account.account_name ||
            currentUser?.full_name ||
            "";

    }


    /*
    |--------------------------------------------------------------------------
    | BALANCE
    |--------------------------------------------------------------------------
    */

    const accountBalance =
        document.getElementById(
            "accountBalance"
        );


    if (accountBalance) {

        const balance =
            Number(
                account.balance || 0
            );


        accountBalance.textContent =
            "₦" +
            balance.toLocaleString(
                "en-NG",
                {
                    minimumFractionDigits:
                        2
                }
            );

    }

}


/*
|--------------------------------------------------------------------------
| START DASHBOARD
|--------------------------------------------------------------------------
*/

document.addEventListener(
    "DOMContentLoaded",
    function() {

        loadDashboardUser();

    }
);
