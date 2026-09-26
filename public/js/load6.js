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
	| VIRTUAL ACCOUNT SELECTED HANDLER
	|--------------------------------------------------------------------------
	*/
 


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
