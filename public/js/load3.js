/*
|--------------------------------------------------------------------------
| FUND WALLET
|--------------------------------------------------------------------------
*/

/*
|--------------------------------------------------------------------------
| FUND WALLET SYSTEM
|--------------------------------------------------------------------------
|
| IMPORTANT:
|
| The frontend does NOT decide which virtual account receives money.
|
| The backend identifies the logged-in user using:
|
|     req.user.id
|
| Then the backend finds that user's virtual_account.
|
|--------------------------------------------------------------------------
*/


document.addEventListener(
    "DOMContentLoaded",
    function () {


        /*
        |--------------------------------------------------------------------------
        | ELEMENTS
        |--------------------------------------------------------------------------
        */

        const fundWalletBtn =
            document.getElementById(
                "fundWalletBtn"
            );


        const fundWalletModalElement =
            document.getElementById(
                "fundWalletModal"
            );


        const fundWalletEmail =
            document.getElementById(
                "fundWalletEmail"
            );


        const fundWalletAccountNo =
            document.getElementById(
                "fundWalletAccountNo"
            );
		
	    const accountno =
		    document.getElementById(
		        "fundWalletAccountNo"
		    ).value;


        const fundWalletAmount =
            document.getElementById(
                "fundWalletAmount"
            );


        const paystackFundBtn =
            document.getElementById(
                "paystackFundBtn"
            );


        const manualFundBtn =
            document.getElementById(
                "manualFundBtn"
            );


        const manualPaymentBox =
            document.getElementById(
                "manualPaymentBox"
            );


        const manualAmountDisplay =
            document.getElementById(
                "manualAmountDisplay"
            );


        // const submitManualPaymentBtn =
        //     document.getElementById(
        //         "submitManualPaymentBtn"
        //     );


        /*
        |--------------------------------------------------------------------------
        | BOOTSTRAP MODAL
        |--------------------------------------------------------------------------
        */

        let fundWalletModal = null;


        if (
            fundWalletModalElement
        ) {

            fundWalletModal =
                new bootstrap.Modal(
                    fundWalletModalElement
                );

        }


        /*
        |--------------------------------------------------------------------------
        | TOKEN
        |--------------------------------------------------------------------------
        */

        function getWalletToken() {

            return localStorage.getItem(
                "token"
            );

        }


        /*
        |--------------------------------------------------------------------------
        | GET LOGGED-IN USER
        |--------------------------------------------------------------------------
        */

        function getLoggedInUser() {

            /*
            ----------------------------------------------------------
            | First use currentUser
            ----------------------------------------------------------
            */

            if (
                typeof currentUser !==
                "undefined" &&
                currentUser
            ) {

                return currentUser;

            }


            /*
            ----------------------------------------------------------
            | Otherwise use localStorage
            ----------------------------------------------------------
            */

            try {

                return JSON.parse(
                    localStorage.getItem(
                        "user"
                    ) || "null"
                );

            } catch (
                error
            ) {

                return null;

            }

        }


        /*
        |--------------------------------------------------------------------------
        | OPEN FUND WALLET
        |--------------------------------------------------------------------------
        */

        fundWalletBtn?.addEventListener(
            "click",
            async function (
                event
            ) {

                event.preventDefault();


                const token =
                    getWalletToken();


                /*
                ------------------------------------------------------
                | LOGIN CHECK
                ------------------------------------------------------
                */

                if (
                    !token
                ) {

                    window.location.href =
                        "login.html";

                    return;

                }


                /*
                ------------------------------------------------------
                | GET USER
                ------------------------------------------------------
                */

                const user =
                    getLoggedInUser();


                if (
                    !user
                ) {

                    alert(
                        "Unable to identify your logged-in account."
                    );

                    return;

                }


                /*
                ------------------------------------------------------
                | GET EMAIL
                ------------------------------------------------------
                */

                const email =
                    user.email ||
                    user.email_address ||
                    "";


                /*
                ------------------------------------------------------
                | GET ACCOUNT FROM CURRENT ACCOUNT IF AVAILABLE
                ------------------------------------------------------
                */

                let accountNo =
                    "";


                if (
                    typeof currentAccount !==
                    "undefined" &&
                    currentAccount
                ) {

                    accountNo =
                        currentAccount.accountno ||
                        "";

                }


                /*
                ------------------------------------------------------
                | FALLBACK TO SAVED ACCOUNT
                ------------------------------------------------------
                */

                if (
                    !accountNo
                ) {

                    try {

                        const savedAccount =
                            JSON.parse(
                                localStorage.getItem(
                                    "selectedAccount"
                                ) || "null"
                            );


                        accountNo =
                            savedAccount?.accountNo ||
                            "";

                    } catch (
                        error
                    ) {

                        accountNo =
                            "";

                    }

                }


                /*
                ------------------------------------------------------
                | DISPLAY EMAIL
                ------------------------------------------------------
                */

                fundWalletEmail.value =
                    email;


                /*
                ------------------------------------------------------
                | DISPLAY ACCOUNT NUMBER
                |
                | This is ONLY for display.
                |
                | Backend will still determine the real account.
                ------------------------------------------------------
                */

                fundWalletAccountNo.value =
                    accountNo ||
                    "Loading account...";


                /*
                ------------------------------------------------------
                | CLEAR AMOUNT
                ------------------------------------------------------
                */

                fundWalletAmount.value =
                    "";


                /*
                ------------------------------------------------------
                | HIDE MANUAL PAYMENT
                ------------------------------------------------------
                */

                manualPaymentBox.classList.add(
                    "d-none"
                );


                /*
                ------------------------------------------------------
                | SHOW MODAL
                ------------------------------------------------------
                */

                fundWalletModal.show();


                /*
                ------------------------------------------------------
                | IF ACCOUNT IS NOT LOADED,
                | FETCH IT FROM SERVER
                ------------------------------------------------------
                */

                if (
                    !accountNo
                ) {

                    try {

                        const response =
                            await fetch(
                                "/api/auth/accounts",
                                {
                                    method:
                                        "GET",

                                    headers: {

                                        "Content-Type":
                                            "application/json",

                                        "Authorization":
                                            "Bearer " +
                                            token

                                    }

                                }
                            );


                        const data =
                            await response.json();


                        if (
                            data.success &&
                            data.accounts &&
                            data.accounts.length
                        ) {

                            const account =
                                data.accounts[0];


                            accountNo =
                                account.accountno;


                            fundWalletAccountNo.value =
                                accountNo;


                        }

                    } catch (
                        error
                    ) {

                        console.error(
                            "Unable to load wallet account:",
                            error
                        );

                    }

                }

            }
        );


        /*
        |--------------------------------------------------------------------------
        | AMOUNT FORMAT
        |--------------------------------------------------------------------------
        */

        fundWalletAmount?.addEventListener(
            "input",
            function () {

                const amount =
                    Number(
                        this.value || 0
                    );


                manualAmountDisplay.textContent =
                    amount.toLocaleString(
                        "en-NG",
                        {
                            minimumFractionDigits:
                                2,

                            maximumFractionDigits:
                                2
                        }
                    );

            }
        );





        /*
        |--------------------------------------------------------------------------
        | SHOW MANUAL PAYMENT
        |--------------------------------------------------------------------------
        */

        manualFundBtn?.addEventListener(
            "click",
            function () {


                const amount =
                    Number(
                        fundWalletAmount.value
                    );


                if (
                    !amount ||
                    amount < 100
                ) {

                    alert(
                        "Please enter an amount first."
                    );

                    fundWalletAmount.focus();

                    return;

                }


                manualAmountDisplay.textContent =
                    amount.toLocaleString(
                        "en-NG",
                        {
                            minimumFractionDigits:
                                2,

                            maximumFractionDigits:
                                2
                        }
                    );


                manualPaymentBox.classList.remove(
                    "d-none"
                );

            }
        );


        /*
        |--------------------------------------------------------------------------
        | SUBMIT MANUAL PAYMENT
        |--------------------------------------------------------------------------
        */

			
			/*
			|--------------------------------------------------------------------------
			| MANUAL PAYMENT BUTTON
			|--------------------------------------------------------------------------
			*/
			
			document.addEventListener(
			    "DOMContentLoaded",
			    function () {
			
			        const manualButton =
			            document.getElementById(
			                "manualFundBtn"
			            );
			
			
			        const manualBox =
			            document.getElementById(
			                "manualPaymentBox"
			            );
			
			
			        const submitButton =
			            document.getElementById(
			                "submitManualPaymentBtn"
			            );
			
			
			        const amountInput =
			            document.getElementById(
			                "fundWalletAmount"
			            );
			
			
			        const amountDisplay =
			            document.getElementById(
			                "manualAmountDisplay"
			            );
			
			
			        /*
			        |--------------------------------------------------------------------------
			        | SHOW MANUAL PAYMENT DETAILS
			        |--------------------------------------------------------------------------
			        */
			
			        if (manualButton) {
			
			            manualButton.addEventListener(
			                "click",
			                function () {
			
			                    const accountSelect =
			                        document.getElementById(
			                            "fundWalletAccountNo"
			                        );
			
			
			                    if (
			                        !accountSelect ||
			                        !accountSelect.value
			                    ) {
			
			                        alert(
			                            "Please select the virtual account you want to fund first."
			                        );
			
			                        return;
			                    }
			
			
			                    const amount =
			                        Number(
			                            amountInput?.value || 0
			                        );
			
			
			                    if (!amount || amount < 100) {
			
			                        alert(
			                            "Please enter the amount you want to fund first."
			                        );
			
			                        return;
			                    }
			
			
			                    if (amountDisplay) {
			
			                        amountDisplay.textContent =
			                            amount.toLocaleString(
			                                "en-NG",
			                                {
			                                    minimumFractionDigits: 2,
			                                    maximumFractionDigits: 2
			                                }
			                            );
			                    }
			
			
			                    if (manualBox) {
			
			                        manualBox.classList.remove(
			                            "d-none"
			                        );
			                    }
			                }
			            );
			        }
			
			
			        /*
			        |--------------------------------------------------------------------------
			        | UPDATE DISPLAYED AMOUNT
			        |--------------------------------------------------------------------------
			        */
			
			        if (amountInput) {
			
			            amountInput.addEventListener(
			                "input",
			                function () {
			
			                    const amount =
			                        Number(
			                            amountInput.value || 0
			                        );
			
			
			                    if (amountDisplay) {
			
			                        amountDisplay.textContent =
			                            amount.toLocaleString(
			                                "en-NG",
			                                {
			                                    minimumFractionDigits: 2,
			                                    maximumFractionDigits: 2
			                                }
			                            );
			                    }
			                }
			            );
			        }
			
			
			        /*
			        |--------------------------------------------------------------------------
			        | SUBMIT MANUAL PAYMENT
			        |--------------------------------------------------------------------------
			        */
			
			        // if (submitButton) {
			
			        //     submitButton.addEventListener(
			        //         "click",
			        //         submitManualBankPayment
			        //     );
			        // }
			
			    }
			);

    }

);



/*
|--------------------------------------------------------------------------
| LOAD VIRTUAL WALLET BALANCE
|--------------------------------------------------------------------------
*/

async function loadWalletBalance() {

    /*
    |--------------------------------------------------------------------------
    | GET TOKEN
    |--------------------------------------------------------------------------
    */

    const token =
        localStorage.getItem(
            "token"
        );


    /*
    |--------------------------------------------------------------------------
    | CHECK LOGIN
    |--------------------------------------------------------------------------
    */

    if (!token) {

        window.location.href =
            "login.html";

        return;

    }


    /*
    |--------------------------------------------------------------------------
    | GET BALANCE ELEMENT
    |--------------------------------------------------------------------------
    */

    const balanceElement =
        document.getElementById(
            "balanceCounter"
        );


    if (!balanceElement) {

        console.error(
            "balanceCounter element not found."
        );

        return;

    }


    /*
    |--------------------------------------------------------------------------
    | SHOW LOADING
    |--------------------------------------------------------------------------
    */

    balanceElement.textContent =
        "Loading...";


    try {

        /*
        |--------------------------------------------------------------------------
        | CALL API
        |--------------------------------------------------------------------------
        */

        const response =
            await fetch(
                "/api/wallet/balance",
                {

                    method: "GET",

                    headers: {

                        "Authorization":
                            "Bearer " +
                            token,

                        "Content-Type":
                            "application/json"

                    }

                }
            );


        /*
        |--------------------------------------------------------------------------
        | GET JSON RESPONSE
        |--------------------------------------------------------------------------
        */

        const result =
            await response.json();


        console.log(
            "Wallet balance:",
            result
        );


        /*
        |--------------------------------------------------------------------------
        | TOKEN EXPIRED / INVALID
        |--------------------------------------------------------------------------
        */

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


        /*
        |--------------------------------------------------------------------------
        | CHECK API SUCCESS
        |--------------------------------------------------------------------------
        */

        if (
            !response.ok ||
            !result.success
        ) {

            throw new Error(
                result.message ||
                "Unable to load wallet balance."
            );

        }


        /*
        |--------------------------------------------------------------------------
        | GET BALANCE
        |--------------------------------------------------------------------------
        */

        const balance =
            Number(
                result.data?.balance || 0
            );


        /*
        |--------------------------------------------------------------------------
        | DISPLAY BALANCE
        |--------------------------------------------------------------------------
        */

        balanceElement.textContent =
            "₦" +
            balance.toLocaleString(
                "en-NG",
                {

                    minimumFractionDigits:
                        2,

                    maximumFractionDigits:
                        2

                }
            );


    } catch (error) {

        console.error(
            "Wallet balance error:",
            error
        );


        /*
        |--------------------------------------------------------------------------
        | DISPLAY FALLBACK
        |--------------------------------------------------------------------------
        */

        balanceElement.textContent =
            "₦0.00";

    }

}


/*
|--------------------------------------------------------------------------
| LOAD WHEN DASHBOARD OPENS
|--------------------------------------------------------------------------
*/

document.addEventListener(
    "DOMContentLoaded",
    function () {

        loadWalletBalance();

    }
);

/*
|--------------------------------------------------------------------------
| LOAD ACCOUNTNO DROPDOWN FRO VIRTUAL
|--------------------------------------------------------------------------
*/


	async function loadFundingAccounts() {

    const select =
        document.getElementById(
            "fundWalletAccountNo"
        );

    if (!select) return;

    try {

        const token =
            localStorage.getItem("token");

        const response =
            await fetch(
                "/api/dashboard/virtual-accounts",
                {
                   
		            headers: {
		
		                "Accept":
		                    "application/json",
		
		                "Authorization":
		                    "Bearer " + token
		
		            }
                }
            );

        const data =
            await response.json();

        if (!data.success) {

            throw new Error(
                data.message ||
                "Unable to load accounts."
            );

        }

        select.innerHTML = `
            <option value="">
                Select virtual account
            </option>
        `;

        data.accounts.forEach(account => {

            const option =
                document.createElement("option");

            option.value =
                account.accountno;

            option.textContent =
                `${account.accountno} - ${account.account_name} - ₦${Number(account.balance).toLocaleString("en-NG", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                })}`;

            select.appendChild(option);

        });

    } catch (error) {

        console.error(
            "Load funding accounts error:",
            error
        );

        select.innerHTML = `
            <option value="">
                Unable to load accounts
            </option>
        `;

    }

}
loadFundingAccounts();
	
/*
|--------------------------------------------------------------------------
| LOAD ACCOUNTNO DROPDOWN FRO VIRTUAL
|--------------------------------------------------------------------------
*/
