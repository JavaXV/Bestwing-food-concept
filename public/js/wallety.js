async function processWeeklyThrift() {

    const token =
        localStorage.getItem("token") ||
        sessionStorage.getItem("token") ||
        localStorage.getItem("accessToken") ||
        sessionStorage.getItem("accessToken") ||
        localStorage.getItem("jwt") ||
        sessionStorage.getItem("jwt");

    if (!token) {
        return;
    }

    try {

        const response = await fetch(
            "/api/thrift/process-weekly-deductions",
            {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${token}`,
                    "Content-Type": "application/json"
                }
            }
        );

        const data = await response.json();

        console.log(
            "WEEKLY THRIFT PROCESS:",
            data
        );

        if (!response.ok || !data.success) {
            console.error(
                data.message ||
                "Weekly thrift processing failed."
            );

            return;
        }

        /*
        -------------------------------------------------
        AFTER PROCESSING, REFRESH DASHBOARD DATA
        -------------------------------------------------
        */

        if (typeof loadThriftSummary === "function") {
            await loadThriftSummary();
        }

        if (typeof loadSubscriptions === "function") {
            await loadSubscriptions();
        }

    } catch (error) {

        console.error(
            "AUTO THRIFT PROCESS ERROR:",
            error
        );
    }
}

document.addEventListener(
    "DOMContentLoaded",
    async function () {

        await processWeeklyThrift();

    }
);



        /* =================================================
           LOAD THRIFT DASHBOARD SUMMARY
        ================================================= */

      async function loadThriftSummary() {

    try {

        const token =
            localStorage.getItem("token");


        if (!token) {
            console.error("Authentication token not found");
            return;
        }


        /*
        |--------------------------------------------------------------------------
        | GET SELECTED ACCOUNTNO
        |--------------------------------------------------------------------------
        */

        const accountSelect =
            document.getElementById(
                "accountSwitcher" 
            );


        const accountno =
            accountSelect
                ? accountSelect.value
                : "";


        /*
        |--------------------------------------------------------------------------
        | BUILD API URL
        |--------------------------------------------------------------------------
        */

        const url =
            accountno
                ? `/api/dashboard/thrift-summary?accountno=${encodeURIComponent(accountno)}`
                : `/api/dashboard/thrift-summary`;


        /*
        |--------------------------------------------------------------------------
        | CALL API
        |--------------------------------------------------------------------------
        */

        const response =
            await fetch(
                url,
                {
                    method: "GET",

                    headers: {
                        "Authorization":
                            `Bearer ${token}`,

                        "Content-Type":
                            "application/json"
                    }
                }
            );


        const result =
            await response.json();


        if (!response.ok || !result.success) {

            throw new Error(
                result.message ||
                "Unable to load dashboard"
            );

        }


        const data =
            result.data;


        /*
        |--------------------------------------------------------------------------
        | TOTAL THRIFT ACCOUNTS
        |--------------------------------------------------------------------------
        */

        document.getElementById(
            "totalThriftAccounts"
        ).textContent =
            Number(
                data.total_thrift_accounts || 0
            ).toLocaleString();


        /*
        |--------------------------------------------------------------------------
        | CURRENT THRIFT WEEKS
        |--------------------------------------------------------------------------
        */

        document.getElementById(
            "currentThriftWeeks"
        ).textContent =
            Number(
                data.current_thrift_weeks || 0
            ).toLocaleString();


        /*
        |--------------------------------------------------------------------------
        | TOTAL CONTRIBUTION
        |--------------------------------------------------------------------------
        */

        document.getElementById(
            "totalThriftContribution"
        ).textContent =
            "₦" +
            Number(
                data.total_contribution || 0
            ).toLocaleString(
                "en-NG",
                {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                }
            );


    } catch (error) {

        console.error(
            "THRIFT DASHBOARD ERROR:",
            error
        );

    }

}

        /* =================================================
           LOAD DASHBOARD WHEN PAGE OPENS
        ================================================= */

        document.addEventListener(
            "DOMContentLoaded",
            loadThriftSummary
        );



		const thriftAccountSwitch =
		    document.getElementById(
		        "thriftAccountSwitch"
		    );
		
		
		if (thriftAccountSwitch) {
		
		    thriftAccountSwitch.addEventListener(
		        "change",
		        function () {
		
		            loadThriftSummary();
		
		        }
		    );
		
		}




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




/*
|--------------------------------------------------------------------------
| AUTHENTICATION
|--------------------------------------------------------------------------
*/

function getToken() {

    return localStorage.getItem("token");

}


/*
|--------------------------------------------------------------------------
| LOAD VIRTUAL ACCOUNTS FOR ADD ACCOUNT MODAL
|--------------------------------------------------------------------------
*/

async function loadAddAccountSources() {

    const select =
        document.getElementById(
            "addAccountSource"
        );

    const balanceDisplay =
        document.getElementById(
            "addAccountCurrentBalance"
        );


    if (!select) {

        console.error(
            "addAccountSource element not found."
        );

        return;
    }


    const token =
        getToken();


    if (!token) {

        window.location.href =
            "login.html";

        return;
    }


    select.innerHTML = `
        <option value="">
            Loading virtual accounts...
        </option>
    `;


    try {

        const response =
            await fetch(
                "/api/dashboard/virtual-accounts",
                {
                    method: "GET",

                    headers: {

                        "Accept":
                            "application/json",

                        "Authorization":
                            "Bearer " + token

                    }
                }
            );


        const text =
            await response.text();


        console.log(
            "ACCOUNTS RESPONSE:",
            text
        );


        let data;


        try {

            data =
                JSON.parse(text);

        } catch (error) {

            console.error(
                "INVALID JSON FROM ACCOUNTS API:",
                text
            );

            throw new Error(
                "Server returned an invalid response."
            );
        }


        if (!response.ok) {

            throw new Error(
                data.message ||
                "Unable to load virtual accounts."
            );
        }


        if (
            !data.success ||
            !Array.isArray(data.accounts)
        ) {

            throw new Error(
                "No virtual account data was returned."
            );
        }


        console.log(
            "USER VIRTUAL ACCOUNTS:",
            data.accounts
        );


        select.innerHTML = `
            <option value="">
                Select virtual account
            </option>
        `;


        if (
            data.accounts.length === 0
        ) {

            select.innerHTML = `
                <option value="">
                    No virtual accounts found
                </option>
            `;

            balanceDisplay.textContent =
                "No account selected.";

            return;
        }


        /*
        |--------------------------------------------------------------------------
        | ADD EACH ACCOUNT TO DROPDOWN
        |--------------------------------------------------------------------------
        */

        data.accounts.forEach(
            function(account) {

                const accountNo =
                    String(
                        account.accountno || ""
                    ).trim();


                const accountName =
                    account.account_name ||
                    "Virtual Account";


                const balance =
                    Number(
                        account.balance || 0
                    );


                if (!accountNo) {

                    return;
                }


                const option =
                    document.createElement(
                        "option"
                    );


                option.value =
                    accountNo;


                option.dataset.balance =
                    balance;


                option.dataset.accountName =
                    accountName;


                option.textContent =
                    accountName +
                    " — " +
                    accountNo +
                    " — ₦" +
                    balance.toLocaleString(
                        "en-NG",
                        {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2
                        }
                    );


                select.appendChild(
                    option
                );

            }
        );


        console.log(
            "DROPDOWN LOADED:",
            select.options.length - 1,
            "accounts"
        );


    } catch (error) {

        console.error(
            "LOAD ADD ACCOUNT SOURCES ERROR:",
            error
        );


        select.innerHTML = `
            <option value="">
                Unable to load accounts
            </option>
        `;


        balanceDisplay.textContent =
            "Unable to load account balance.";
    }

}


/*
|--------------------------------------------------------------------------
| ACCOUNT SELECTION
|--------------------------------------------------------------------------
*/

document.addEventListener(
    "change",
    function(event) {

        if (
            event.target.id !==
            "addAccountSource"
        ) {

            return;
        }


        const select =
            event.target;


        const option =
            select.options[
                select.selectedIndex
            ];


        const balanceDisplay =
            document.getElementById(
                "addAccountCurrentBalance"
            );


        if (!select.value) {

            balanceDisplay.textContent =
                "No account selected.";

            return;
        }


        const balance =
            Number(
                option.dataset.balance || 0
            );


        balanceDisplay.textContent =
            "₦" +
            balance.toLocaleString(
                "en-NG",
                {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                }
            );


        console.log(
            "SELECTED PAYMENT ACCOUNT:",
            {
                accountno:
                    select.value,

                account_name:
                    option.dataset.accountName,

                balance:
                    balance
            }
        );

    }
);


/*
|--------------------------------------------------------------------------
| OPEN ADD ACCOUNT MODAL
|--------------------------------------------------------------------------
*/

document.addEventListener(
    "click",
    function(event) {

        const button =
            event.target.closest(
                "#addAccountBtn"
            );


        if (!button) {

            return;
        }


        event.preventDefault();


        const modalElement =
            document.getElementById(
                "addAccountModal"
            );


        if (!modalElement) {

            console.error(
                "addAccountModal not found."
            );

            return;
        }


        /*
        |--------------------------------------------------------------------------
        | LOAD ACCOUNTS BEFORE SHOWING MODAL
        |--------------------------------------------------------------------------
        */

        loadAddAccountSources();


        const modal =
            bootstrap.Modal.getOrCreateInstance(
                modalElement
            );


        modal.show();

    }
);




document.addEventListener("DOMContentLoaded", function () {

    const accountSwitcher =
        document.getElementById("accountSwitcher");


    if (!accountSwitcher) {
        return;
    }


    /*
    |--------------------------------------------------------------------------
    | SWITCH ACCOUNT
    |--------------------------------------------------------------------------
    | Save selected account number, then reload the page.
    |--------------------------------------------------------------------------
    */

    accountSwitcher.addEventListener(
        "change",
        function () {

            const accountno =
                this.value.trim();


            /*
            |--------------------------------------------------------------------------
            | DO NOTHING IF "SELECT ACCOUNT" IS CHOSEN
            |--------------------------------------------------------------------------
            */

            if (!accountno) {
                return;
            }


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
            | RELOAD PAGE
            |--------------------------------------------------------------------------
            */

            window.location.reload();

        }
    );

});



	 /*
	|--------------------------------------------------------------------------
	| LOAD USER VIRTUAL ACCOUNT
	|--------------------------------------------------------------------------
	*/

async function loadAddAccountSources() {

    const select =
        document.getElementById("addAccountSource");

    const balanceDisplay =
        document.getElementById("addAccountBalance");

    if (!select) {
        console.error(
            "addAccountSource element was not found."
        );
        return;
    }

    select.innerHTML = `
        <option value="">
            Loading virtual accounts...
        </option>
    `;

    try {

        const token =
            localStorage.getItem("token");

        if (!token) {

            window.location.href =
                "login.html";

            return;
        }

        const response =
            await fetch(
                "/api/dashboard/accounts",
                {
                    method: "GET",

                    headers: {
                        "Accept":
                            "application/json",

                        "Authorization":
                            "Bearer " + token
                    }
                }
            );

        const text =
            await response.text();

        console.log(
            "ACCOUNTS API RESPONSE:",
            text
        );

        let data;

        try {
            data = JSON.parse(text);
        } catch (error) {

            console.error(
                "ACCOUNTS API DID NOT RETURN JSON:",
                text
            );

            throw new Error(
                "Server returned an invalid response."
            );
        }

        if (!response.ok) {

            throw new Error(
                data.message ||
                "Unable to load virtual accounts."
            );
        }

        if (
            !data.success ||
            !Array.isArray(data.accounts)
        ) {

            throw new Error(
                "No virtual account data was returned."
            );
        }

        console.log(
            "VIRTUAL ACCOUNTS:",
            data.accounts
        );

        select.innerHTML = `
            <option value="">
                Select virtual account
            </option>
        `;

        if (data.accounts.length === 0) {

            select.innerHTML = `
                <option value="">
                    No virtual accounts found
                </option>
            `;

            if (balanceDisplay) {
                balanceDisplay.textContent =
                    "No account selected.";
            }

            return;
        }

        data.accounts.forEach(
            function (account) {

                const accountNo =
                    String(
                        account.accountno || ""
                    ).trim();

                const accountName =
                    account.account_name ||
                    "Virtual Account";

                const balance =
                    Number(
                        account.balance || 0
                    );

                if (!accountNo) {
                    return;
                }

                const option =
                    document.createElement(
                        "option"
                    );

                option.value =
                    accountNo;

                option.dataset.balance =
                    balance;

                option.dataset.accountName =
                    accountName;

                option.textContent =
                    accountName +
                    " — " +
                    accountNo +
                    " — ₦" +
                    balance.toLocaleString(
                        "en-NG",
                        {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2
                        }
                    );

                select.appendChild(
                    option
                );
            }
        );

        console.log(
            "DROPDOWN ACCOUNTS LOADED:",
            select.options.length - 1
        );

    } catch (error) {

        console.error(
            "LOAD ADD ACCOUNT SOURCES ERROR:",
            error
        );

        select.innerHTML = `
            <option value="">
                Unable to load virtual accounts
            </option>
        `;

        if (balanceDisplay) {
            balanceDisplay.textContent =
                "Unable to load account balance.";
        }
    }
}

	loadAddAccountSources();

	 /*
	|--------------------------------------------------------------------------
	| SHOW SELECTED VIRTUAL ACCOUNT BALANCE
	|--------------------------------------------------------------------------
	*/
document
    .getElementById("addAccountSource")
    .addEventListener(
        "change",
        function () {

            const option =
                this.options[this.selectedIndex];

            const balanceElement =
                document.getElementById(
                    "addAccountBalance"
                );

            if (!this.value) {

                balanceElement.textContent =
                    "No account selected.";

                return;
            }

            const balance =
                Number(
                    option.dataset.balance || 0
                );

            balanceElement.textContent =
                "₦" +
                balance.toLocaleString(
                    "en-NG",
                    {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                    }
                );
        }
    );


	/*
	|--------------------------------------------------------------------------
	| VIRTUAL ACCOUNT SELECTED HANDLER
	|--------------------------------------------------------------------------
	*/

	const sourceAccountNo = document.getElementById("addAccountSource").value;
	
	if (!sourceAccountNo) {
	
	    alert(
	        "Please select the virtual account to pay from."
	    );
	
	    return;
	}
		 /*
	|--------------------------------------------------------------------------
	| SHOW SELECTED VIRTUAL ACCOUNT TO PAY FROM
	|--------------------------------------------------------------------------
	*/
	
	document
    .getElementById("addAccountSource")
    .addEventListener(
        "change",
        function () {

            const selectedOption =
                this.options[
                    this.selectedIndex
                ];

            const balanceDisplay =
                document.getElementById(
                    "addAccountBalance"
                );

            if (!this.value) {

                balanceDisplay.textContent =
                    "No account selected.";

                return;
            }

            const balance =
                Number(
                    selectedOption
                        .dataset
                        .balance || 0
                );

            balanceDisplay.textContent =
                "₦" +
                balance.toLocaleString(
                    "en-NG",
                    {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                    }
                );

            console.log(
                "SELECTED PAYMENT ACCOUNT:",
                {
                    accountno: this.value,
                    account_name:
                        selectedOption
                            .dataset
                            .accountName,
                    balance: balance
                }
            );
        }
    );

 
	




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



