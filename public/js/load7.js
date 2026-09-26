/*
|--------------------------------------------------------------------------
| PAY ₦5,000 FROM SELECTED VIRTUAL ACCOUNT
|--------------------------------------------------------------------------
*/

document
    .getElementById("payFromAccountBtn")
    ?.addEventListener("click", async function () {

        const button = this;

        const accountSelect =
            document.getElementById("addAccountSource");

        const messageBox =
            document.getElementById("addAccountMessage");

        /*
        |--------------------------------------------------------------------------
        | CHECK ACCOUNT SELECTOR
        |--------------------------------------------------------------------------
        */

        if (!accountSelect) {

            console.error(
                "addAccountSource dropdown was not found."
            );

            return;
        }

        /*
        |--------------------------------------------------------------------------
        | GET SELECTED ACCOUNT NUMBER
        |--------------------------------------------------------------------------
        */

        const accountno =
            String(accountSelect.value || "").trim();

        /*
        |--------------------------------------------------------------------------
        | VALIDATE SELECTION
        |--------------------------------------------------------------------------
        */

        if (!accountno) {

            messageBox.className =
                "alert alert-danger";

            messageBox.textContent =
                "Please select the virtual account you want to use.";

            return;
        }

        /*
        |--------------------------------------------------------------------------
        | GET JWT TOKEN
        |--------------------------------------------------------------------------
        */

        const token =
            localStorage.getItem("token");

        if (!token) {

            window.location.href =
                "/login.html";

            return;
        }

        /*
        |--------------------------------------------------------------------------
        | GET SELECTED OPTION
        |--------------------------------------------------------------------------
        */

        const selectedOption =
            accountSelect.options[
                accountSelect.selectedIndex
            ];

        const accountName =
            selectedOption?.dataset?.accountName ||
            "Virtual Account";

        const displayedBalance =
            Number(
                selectedOption?.dataset?.balance || 0
            );

        console.log(
            "PAYING FROM SELECTED ACCOUNT:",
            {
                accountno,
                accountName,
                displayedBalance
            }
        );

        /*
        |--------------------------------------------------------------------------
        | CHECK DISPLAYED BALANCE
        |--------------------------------------------------------------------------
        |
        | This is only a convenience check.
        | The backend MUST check the real database balance.
        |
        */

        if (displayedBalance < 3000) {

            messageBox.className =
                "alert alert-danger";

            messageBox.textContent =
                "Insufficient balance in the selected account.";

            return;
        }

        /*
        |--------------------------------------------------------------------------
        | CONFIRM PAYMENT
        |--------------------------------------------------------------------------
        */

        const confirmed =
            confirm(
                "Pay ₦3,000 from account " +
                accountno +
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
            "Processing...";

        messageBox.className =
            "alert alert-info";

        messageBox.textContent =
            "Processing account creation payment...";

        try {

            /*
            |--------------------------------------------------------------------------
            | SEND ACCOUNT NUMBER TO BACKEND
            |--------------------------------------------------------------------------
            */

            const response =
                await fetch(
                    "/api/payments/accounts/add",
                    {
                        method: "POST",

                        headers: {
                            "Content-Type":
                                "application/json",

                            "Accept":
                                "application/json",

                            "Authorization":
                                "Bearer " + token
                        },

                        body: JSON.stringify({

                            accountno:
                                accountno

                        })
                    }
                );

            /*
            |--------------------------------------------------------------------------
            | READ RESPONSE SAFELY
            |--------------------------------------------------------------------------
            */

            const text =
                await response.text();

            console.log(
                "ADD ACCOUNT PAYMENT RESPONSE:",
                text
            );

            let data;

            try {

                data =
                    JSON.parse(text);

            } catch (parseError) {

                throw new Error(
                    "Server returned an invalid response."
                );
            }

            /*
            |--------------------------------------------------------------------------
            | HANDLE ERROR
            |--------------------------------------------------------------------------
            */

            if (!response.ok || !data.success) {

                throw new Error(
                    data.message ||
                    "Unable to create new account."
                );
            }

            /*
            |--------------------------------------------------------------------------
            | SUCCESS
            |--------------------------------------------------------------------------
            */

            messageBox.className =
                "alert alert-success";

            messageBox.textContent =
                data.message ||
                "Account created successfully.";

            /*
            |--------------------------------------------------------------------------
            | CLOSE MODAL AFTER SHORT DELAY
            |--------------------------------------------------------------------------
            */

            setTimeout(
                function () {

                    const modalElement =
                        document.getElementById(
                            "addAccountModal"
                        );

                    if (modalElement) {

                        const modal =
                            bootstrap.Modal.getInstance(
                                modalElement
                            );

                        if (modal) {
                            modal.hide();
                        }
                    }

                    /*
                    |--------------------------------------------------------------------------
                    | RELOAD DASHBOARD
                    |--------------------------------------------------------------------------
                    */

                    window.location.reload();

                },
                1200
            );

        } catch (error) {

            console.error(
                "PAY FROM VIRTUAL ACCOUNT ERROR:",
                error
            );

            messageBox.className =
                "alert alert-danger";

            messageBox.textContent =
                error.message ||
                "Unable to process payment.";

            /*
            |--------------------------------------------------------------------------
            | RESTORE BUTTON
            |--------------------------------------------------------------------------
            */

            button.disabled = false;

            button.innerHTML =
                '<i class="bi bi-wallet2 me-2"></i>' +
                "Pay ₦5,000 From This Account";
        }

    });