// ============================================================
// BESTWING MEMBER DASHBOARD
// VIRTUAL ACCOUNT MANAGEMENT
// ============================================================

(function () {

    "use strict";


    // ========================================================
    // CONFIGURATION
    // ========================================================

    const API_BASE =
        "/api/dashboard";


    // ========================================================
    // ELEMENTS
    // ========================================================

    const accountSwitcher =
        document.getElementById(
            "accountSwitcher"
        );


    const balanceCounter =
        document.getElementById(
            "balanceCounter"
        );


    const selectedBalanceAccount =
        document.getElementById(
            "selectedBalanceAccount"
        );


    const bankAccountNumber =
        document.getElementById(
            "bankAccountNumber"
        );


    const bankAccountName =
        document.getElementById(
            "bankAccountName"
        );


    const infoAccountNo =
        document.getElementById(
            "infoAccountNo"
        );


    const userAccountNo =
        document.getElementById(
            "userAccountNo"
        );


    const tableAccountNo =
        document.getElementById(
            "tableAccountNo"
        );


    const tableCreated =
        document.getElementById(
            "tableCreated"
        );


    const accountsTableBody =
        document.getElementById(
            "accountsTableBody"
        );


    const lastLoginText =
        document.getElementById(
            "lastLoginText"
        );


    // ========================================================
    // TOKEN
    // ========================================================

    function getToken() {

        return (
            localStorage.getItem("token") ||
            sessionStorage.getItem("token") ||
            ""
        );

    }


    // ========================================================
    // API REQUEST
    // ========================================================

    async function apiRequest(
        url,
        options = {}
    ) {

        const token =
            getToken();


        const headers = {

            "Content-Type":
                "application/json",

            ...(options.headers || {})

        };


        if (token) {

            headers.Authorization =
                `Bearer ${token}`;

        }


        const response =
            await fetch(
                url,
                {
                    ...options,
                    headers
                }
            );


        let data = null;


        try {

            data =
                await response.json();

        } catch (error) {

            data = {};

        }


        if (!response.ok) {

            throw new Error(
                data.message ||
                "Request failed."
            );

        }


        return data;

    }


    // ========================================================
    // FORMAT MONEY
    // ========================================================

    function formatMoney(amount) {

        const value =
            Number(amount || 0);


        return "₦" +
            value.toLocaleString(
                "en-NG",
                {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                }
            );

    }


    // ========================================================
    // FORMAT DATE
    // ========================================================

    function formatDate(date) {

        if (!date) {

            return "-";

        }


        const d =
            new Date(date);


        if (Number.isNaN(d.getTime())) {

            return "-";

        }


        return d.toLocaleDateString(
            "en-NG",
            {
                year: "numeric",
                month: "short",
                day: "numeric"
            }
        );

    }


    // ========================================================
    // DISPLAY BALANCE
    // ========================================================

    function displayBalance(
        account
    ) {

        const balance =
            Number(
                account.balance || 0
            );


        if (balanceCounter) {

            balanceCounter.textContent =
                formatMoney(balance);

        }


        if (selectedBalanceAccount) {

            selectedBalanceAccount.textContent =
                "Account: " +
                account.accountno;

        }


        if (bankAccountNumber) {

            bankAccountNumber.textContent =
                account.accountno;

        }


        if (bankAccountName) {

            bankAccountName.textContent =
                account.account_name ||
                "Member Account";

        }


        if (infoAccountNo) {

            infoAccountNo.textContent =
                account.accountno;

        }


        if (userAccountNo) {

            userAccountNo.textContent =
                account.accountno;

        }


        if (tableAccountNo) {

            tableAccountNo.textContent =
                account.accountno;

        }


        if (lastLoginText) {

            lastLoginText.textContent =
                "Balance: " +
                formatMoney(balance);

        }

    }


    // ========================================================
    // SAVE CURRENT ACCOUNT
    // ========================================================

    function saveSelectedAccount(
        accountno
    ) {

        if (!accountno) {

            return;

        }


        localStorage.setItem(
            "selectedVirtualAccount",
            accountno
        );

    }


    // ========================================================
    // GET SAVED ACCOUNT
    // ========================================================

    function getSavedAccount() {

        return localStorage.getItem(
            "selectedVirtualAccount"
        );

    }


    // ========================================================
    // LOAD SELECTED ACCOUNT BALANCE
    // ========================================================

    async function loadAccountBalance(
        accountno
    ) {

        if (!accountno) {

            return;

        }


        try {

            if (balanceCounter) {

                balanceCounter.textContent =
                    "Loading...";

            }


            const data =
                await apiRequest(
                    `${API_BASE}/virtual-account-balance/${encodeURIComponent(accountno)}`
                );


            if (!data.success) {

                throw new Error(
                    data.message ||
                    "Unable to load balance."
                );

            }


            displayBalance(
                data.account
            );


            saveSelectedAccount(
                data.account.accountno
            );


        } catch (error) {

            console.error(
                "LOAD ACCOUNT BALANCE ERROR:",
                error
            );


            if (balanceCounter) {

                balanceCounter.textContent =
                    "₦0.00";

            }


            if (selectedBalanceAccount) {

                selectedBalanceAccount.textContent =
                    error.message;

            }

        }

    }


    // ========================================================
    // LOAD VIRTUAL ACCOUNTS
    // ========================================================

    async function loadUserAccounts() {

        try {

            if (accountSwitcher) {

                accountSwitcher.innerHTML = `
                    <option value="">
                        Loading accounts...
                    </option>
                `;

            }


            const data =
                await apiRequest(
                    `${API_BASE}/virtual-accounts`
                );


            if (
                !data.success ||
                !Array.isArray(data.accounts)
            ) {

                throw new Error(
                    data.message ||
                    "No virtual accounts found."
                );

            }


            const accounts =
                data.accounts;


            if (accounts.length === 0) {

                if (accountSwitcher) {

                    accountSwitcher.innerHTML = `
                        <option value="">
                            No virtual account found
                        </option>
                    `;

                }


                if (balanceCounter) {

                    balanceCounter.textContent =
                        "₦0.00";

                }


                return;

            }


            // ==================================================
            // CLEAR DROPDOWN
            // ==================================================

            accountSwitcher.innerHTML = `
                <option value="">
                    Select Virtual Account
                </option>
            `;


            // ==================================================
            // ADD ACCOUNTS
            // ==================================================

            accounts.forEach(
                account => {

                    const option =
                        document.createElement(
                            "option"
                        );


                    option.value =
                        account.accountno;


                    option.textContent =
                        `${account.accountno} - ${account.account_name} - ${formatMoney(account.balance)}`;


                    option.dataset.balance =
                        account.balance;


                    accountSwitcher.appendChild(
                        option
                    );

                }
            );


            // ==================================================
            // SELECT SAVED ACCOUNT
            // ==================================================

            const savedAccount =
                getSavedAccount();


            let selectedAccount =
                accounts.find(
                    account =>
                        account.accountno ===
                        savedAccount
                );


            // If saved account does not exist,
            // use first account.

            if (!selectedAccount) {

                selectedAccount =
                    accounts[0];

            }


            if (selectedAccount) {

                accountSwitcher.value =
                    selectedAccount.accountno;


                displayBalance(
                    selectedAccount
                );


                saveSelectedAccount(
                    selectedAccount.accountno
                );

            }


            // ==================================================
            // BUILD ACCOUNT TABLE
            // ==================================================

            buildAccountsTable(
                accounts
            );


        } catch (error) {

            console.error(
                "LOAD USER ACCOUNTS ERROR:",
                error
            );


            if (accountSwitcher) {

                accountSwitcher.innerHTML = `
                    <option value="">
                        Unable to load accounts
                    </option>
                `;

            }

        }

    }


    // ========================================================
    // ACCOUNT SWITCHER
    // ========================================================

    if (accountSwitcher) {

        accountSwitcher.addEventListener(
            "change",
            async function () {

                const accountno =
                    this.value;


                if (!accountno) {

                    if (balanceCounter) {

                        balanceCounter.textContent =
                            "₦0.00";

                    }

                    if (selectedBalanceAccount) {

                        selectedBalanceAccount.textContent =
                            "No account selected";

                    }

                    return;

                }


                await loadAccountBalance(
                    accountno
                );

            }
        );

    }


    // ========================================================
    // BUILD ACCOUNT TABLE
    // ========================================================

    function buildAccountsTable(
        accounts
    ) {

        if (!accountsTableBody) {

            return;

        }


        accountsTableBody.innerHTML = "";


        const selectedAccount =
            getSavedAccount();


        accounts.forEach(
            account => {

                const tr =
                    document.createElement(
                        "tr"
                    );


                const isCurrent =
                    account.accountno ===
                    selectedAccount;


                tr.innerHTML = `

                    <td class="fw-bold">
                        ${account.accountno}
                    </td>

                    <td>
                        Virtual Account
                    </td>

                    <td>
                        ${formatDate(account.created_at)}
                    </td>

                    <td>

                        <span
                            class="
                                badge-soft
                                bg-success-subtle
                                text-success
                            "
                        >
                            Active
                        </span>

                    </td>

                    <td>

                        <span
                            class="
                                badge-soft
                                bg-light
                                text-muted
                            "
                        >
                            ${formatMoney(account.balance)}
                        </span>

                    </td>

                    <td class="text-end">

                        <button
                            type="button"
                            class="
                                btn
                                btn-sm
                                ${isCurrent
                                    ? "btn-success"
                                    : "btn-primary"
                                }
                                switch-account
                            "
                            data-accountno="${account.accountno}"
                        >

                            ${
                                isCurrent
                                    ? "Current"
                                    : "Switch"
                            }

                        </button>

                    </td>

                `;


                accountsTableBody.appendChild(
                    tr
                );

            }
        );


        // =====================================================
        // SWITCH BUTTONS
        // =====================================================

        document
            .querySelectorAll(
                ".switch-account"
            )
            .forEach(
                button => {

                    button.addEventListener(
                        "click",
                        async function () {

                            const accountno =
                                this.dataset.accountno;


                            if (!accountno) {

                                return;

                            }


                            accountSwitcher.value =
                                accountno;


                            await loadAccountBalance(
                                accountno
                            );


                            // Refresh table so
                            // Current button changes.

                            const data =
                                await apiRequest(
                                    `${API_BASE}/virtual-accounts`
                                );


                            if (
                                data.success &&
                                Array.isArray(
                                    data.accounts
                                )
                            ) {

                                buildAccountsTable(
                                    data.accounts
                                );

                            }

                        }
                    );

                }
            );

    }


    // ========================================================
    // COPY BANK ACCOUNT
    // ========================================================

    const copyBankBtn =
        document.getElementById(
            "copyBankBtn"
        );


    if (copyBankBtn) {

        copyBankBtn.addEventListener(
            "click",
            async function () {

                const accountno =
                    accountSwitcher?.value ||
                    bankAccountNumber?.textContent;


                if (
                    !accountno ||
                    accountno ===
                    "Loading..."
                ) {

                    alert(
                        "Please select a virtual account first."
                    );

                    return;

                }


                try {

                    await navigator.clipboard.writeText(
                        accountno
                    );


                    const originalText =
                        this.innerHTML;


                    this.innerHTML = `
                        <i class="bi bi-check-lg me-2"></i>
                        Copied
                    `;


                    setTimeout(
                        () => {

                            this.innerHTML =
                                originalText;

                        },
                        2000
                    );

                } catch (error) {

                    alert(
                        "Unable to copy account number."
                    );

                }

            }
        );

    }


    // ========================================================
    // INITIAL LOAD
    // ========================================================

    document.addEventListener(
        "DOMContentLoaded",
        function () {

            loadUserAccounts();

        }
    );


})();



	
function updateDashboardBalance(balance) {

    const balanceCounter =
        document.getElementById(
            "balanceCounter"
        );

    if (!balanceCounter) {
        return;
    }

    const amount =
        Number(balance || 0);

    balanceCounter.textContent =
        `₦${amount.toLocaleString(
            "en-NG",
            {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            }
        )}`;

}

document.addEventListener(
    "DOMContentLoaded",
    function () {

        loadVirtualAccounts();

    }
);



/*
|--------------------------------------------------------------------------
| BESTWING MEMBER DASHBOARD
| ACCOUNT SELECTION + VIRTUAL ACCOUNT BALANCE
|--------------------------------------------------------------------------
*/

document.addEventListener("DOMContentLoaded", function () {

    /*
    |--------------------------------------------------------------------------
    | CONFIGURATION
    |--------------------------------------------------------------------------
    */

    const API_BASE = "/api";


    /*
    |--------------------------------------------------------------------------
    | GET JWT TOKEN
    |--------------------------------------------------------------------------
    */

    const token =
        localStorage.getItem("token");


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
    | ELEMENTS
    |--------------------------------------------------------------------------
    */

    const accountSwitcher =
        document.getElementById(
            "accountSwitcher"
        );

    const fundWalletAccountNo =
        document.getElementById(
            "fundWalletAccountNo"
        );

    const balanceCounter =
        document.getElementById(
            "balanceCounter"
        );

    const selectedBalanceAccount =
        document.getElementById(
            "selectedBalanceAccount"
        );

    const userAccountNo =
        document.getElementById(
            "userAccountNo"
        );

    const infoAccountNo =
        document.getElementById(
            "infoAccountNo"
        );

    const bankAccountNumber =
        document.getElementById(
            "bankAccountNumber"
        );

    const bankAccountName =
        document.getElementById(
            "bankAccountName"
        );

    const tableAccountNo =
        document.getElementById(
            "tableAccountNo"
        );

    const tableCreated =
        document.getElementById(
            "tableCreated"
        );

    const accountsTableBody =
        document.getElementById(
            "accountsTableBody"
        );

    const addAccountCurrentBalance =
        document.getElementById(
            "addAccountCurrentBalance"
        );

    const fundWalletEmail =
        document.getElementById(
            "fundWalletEmail"
        );


    /*
    |--------------------------------------------------------------------------
    | GLOBAL ACCOUNT DATA
    |--------------------------------------------------------------------------
    */

    let accounts = [];

    let selectedAccount = null;


    /*
    |--------------------------------------------------------------------------
    | AUTH HEADERS
    |--------------------------------------------------------------------------
    */

    function authHeaders() {

        return {

            "Content-Type":
                "application/json",

            "Authorization":
                `Bearer ${token}`

        };

    }


    /*
    |--------------------------------------------------------------------------
    | FORMAT MONEY
    |--------------------------------------------------------------------------
    */

    function formatMoney(amount) {

        const value =
            Number(amount || 0);

        return "₦" +
            value.toLocaleString(
                "en-NG",
                {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                }
            );

    }


    /*
    |--------------------------------------------------------------------------
    | FORMAT ACCOUNT NUMBER
    |--------------------------------------------------------------------------
    */

    function formatAccountNumber(accountNo) {

        if (!accountNo) {
            return "";
        }

        return String(accountNo);

    }


    /*
    |--------------------------------------------------------------------------
    | SET SELECTED ACCOUNT
    |--------------------------------------------------------------------------
    */

    function setSelectedAccount(account) {

        if (!account) {

            selectedAccount = null;

            if (balanceCounter) {
                balanceCounter.textContent =
                    "₦0.00";
            }

            if (selectedBalanceAccount) {
                selectedBalanceAccount.textContent =
                    "No account selected";
            }

            if (addAccountCurrentBalance) {
                addAccountCurrentBalance.textContent =
                    "No account selected";
            }

            return;

        }


        const accountNo =
            formatAccountNumber(
                account.accountno
            );


        const balance =
            Number(
                account.balance || 0
            );


        /*
        |--------------------------------------------------------------------------
        | SAVE SELECTED ACCOUNT
        |--------------------------------------------------------------------------
        */

        localStorage.setItem(
            "selectedAccountNo",
            accountNo
        );


        /*
        |--------------------------------------------------------------------------
        | UPDATE BALANCE
        |--------------------------------------------------------------------------
        */

        if (balanceCounter) {

            balanceCounter.textContent =
                formatMoney(balance);

        }


        /*
        |--------------------------------------------------------------------------
        | UPDATE SELECTED ACCOUNT TEXT
        |--------------------------------------------------------------------------
        */

        if (selectedBalanceAccount) {

            selectedBalanceAccount.textContent =
                "Account: " + accountNo;

        }


        /*
        |--------------------------------------------------------------------------
        | UPDATE ADD ACCOUNT BALANCE
        |--------------------------------------------------------------------------
        */

        if (addAccountCurrentBalance) {

            addAccountCurrentBalance.innerHTML =
                `
                ${formatMoney(balance)}
                <div class="small text-muted mt-1">
                    Account: ${accountNo}
                </div>
                `;

        }


        /*
        |--------------------------------------------------------------------------
        | UPDATE HEADER ACCOUNT
        |--------------------------------------------------------------------------
        */

        if (userAccountNo) {
            userAccountNo.textContent =
                accountNo;
        }


        /*
        |--------------------------------------------------------------------------
        | UPDATE INFORMATION ACCOUNT
        |--------------------------------------------------------------------------
        */

        if (infoAccountNo) {
            infoAccountNo.textContent =
                accountNo;
        }


        /*
        |--------------------------------------------------------------------------
        | UPDATE BANK CARD
        |--------------------------------------------------------------------------
        */

        if (bankAccountNumber) {

            bankAccountNumber.textContent =
                accountNo;

        }


        if (bankAccountName) {

            bankAccountName.textContent =
                account.account_name ||
                "Member Account";

        }


        /*
        |--------------------------------------------------------------------------
        | UPDATE TABLE
        |--------------------------------------------------------------------------
        */

        if (tableAccountNo) {

            tableAccountNo.textContent =
                accountNo;

        }


        if (tableCreated) {

            tableCreated.textContent =
                account.created_at
                    ? new Date(
                        account.created_at
                    ).toLocaleDateString(
                        "en-NG"
                    )
                    : "-";

        }

    }


    /*
    |--------------------------------------------------------------------------
    | POPULATE FUND WALLET DROPDOWN
    |--------------------------------------------------------------------------
    */

    function populateFundWalletAccounts() {

        if (!fundWalletAccountNo) {
            return;
        }


        fundWalletAccountNo.innerHTML =
            `
            <option value="">
                Select virtual account
            </option>
            `;


        accounts.forEach(function (account) {

            const option =
                document.createElement("option");


            option.value =
                account.accountno;


            option.textContent =
                `${account.accountno} — ${formatMoney(account.balance)}`;


            option.dataset.balance =
                account.balance;


            option.dataset.accountName =
                account.account_name || "";


            fundWalletAccountNo.appendChild(
                option
            );

        });


        /*
        |--------------------------------------------------------------------------
        | RESTORE PREVIOUSLY SELECTED ACCOUNT
        |--------------------------------------------------------------------------
        */

        const savedAccountNo =
            localStorage.getItem(
                "selectedAccountNo"
            );


        let accountToSelect =
            accounts.find(
                account =>
                    String(
                        account.accountno
                    ) ===
                    String(
                        savedAccountNo
                    )
            );


        /*
        |--------------------------------------------------------------------------
        | DEFAULT TO FIRST ACTIVE ACCOUNT
        |--------------------------------------------------------------------------
        */

        if (!accountToSelect) {

            accountToSelect =
                accounts.find(
                    account =>
                        account.status ===
                        "active"
                );

        }


        if (!accountToSelect) {

            accountToSelect =
                accounts[0];

        }


        if (accountToSelect) {

            fundWalletAccountNo.value =
                accountToSelect.accountno;

            setSelectedAccount(
                accountToSelect
            );

            if (accountSwitcher) {

                accountSwitcher.value =
                    accountToSelect.accountno;

            }

        }

    }


    /*
    |--------------------------------------------------------------------------
    | POPULATE MAIN ACCOUNT SWITCHER
    |--------------------------------------------------------------------------
    */

    function populateAccountSwitcher() {

        if (!accountSwitcher) {
            return;
        }


        accountSwitcher.innerHTML =
            `
            <option value="">
                Select Account
            </option>
            `;


        accounts.forEach(function (account) {

            const option =
                document.createElement("option");


            option.value =
                account.accountno;


            option.textContent =
                `${account.accountno} — ${formatMoney(account.balance)}`;


            accountSwitcher.appendChild(
                option
            );

        });


        /*
        |--------------------------------------------------------------------------
        | SELECT CURRENT ACCOUNT
        |--------------------------------------------------------------------------
        */

        if (selectedAccount) {

            accountSwitcher.value =
                selectedAccount.accountno;

        }

    }


    /*
    |--------------------------------------------------------------------------
    | RENDER ACCOUNTS TABLE
    |--------------------------------------------------------------------------
    */

    function renderAccountsTable() {

        if (!accountsTableBody) {
            return;
        }


        accountsTableBody.innerHTML = "";


        if (accounts.length === 0) {

            accountsTableBody.innerHTML =
                `
                <tr>
                    <td
                        colspan="6"
                        class="text-center text-muted py-4"
                    >
                        No virtual account found.
                    </td>
                </tr>
                `;

            return;

        }


        accounts.forEach(function (account) {

            const tr =
                document.createElement("tr");


            const created =
                account.created_at
                    ? new Date(
                        account.created_at
                    ).toLocaleDateString(
                        "en-NG"
                    )
                    : "-";


            const isCurrent =
                selectedAccount &&
                String(
                    selectedAccount.accountno
                ) ===
                String(
                    account.accountno
                );


            tr.innerHTML =
                `
                <td class="fw-bold">
                    ${account.accountno}
                </td>

                <td>
                    ${account.account_name || "Virtual Account"}
                </td>

                <td>
                    ${created}
                </td>

                <td>
                    ${
                        account.status === "active"
                        ?
                        `
                        <span
                            class="
                                badge-soft
                                bg-success-subtle
                                text-success
                            "
                        >
                            Active
                        </span>
                        `
                        :
                        `
                        <span
                            class="
                                badge-soft
                                bg-warning-subtle
                                text-warning
                            "
                        >
                            ${account.status}
                        </span>
                        `
                    }
                </td>

                <td>
                    ${formatMoney(account.balance)}
                </td>

                <td class="text-end">

                    <button
                        type="button"
                        class="
                            btn
                            btn-sm
                            ${
                                isCurrent
                                ? "btn-success"
                                : "btn-primary"
                            }
                            switch-account
                        "
                        data-account-no="${account.accountno}"
                    >

                        ${
                            isCurrent
                            ? "Current"
                            : "Switch"
                        }

                    </button>

                </td>
                `;


            accountsTableBody.appendChild(
                tr
            );

        });

    }


    /*
    |--------------------------------------------------------------------------
    | LOAD ALL VIRTUAL ACCOUNTS
    |--------------------------------------------------------------------------
    */

    async function loadAccounts() {

        try {

            const response =
                await fetch(
                    `${API_BASE}/auth/accounts`,
                    {
                        method: "GET",
                        headers:
                            authHeaders()
                    }
                );


            /*
            |--------------------------------------------------------------------------
            | AUTHENTICATION FAILURE
            |--------------------------------------------------------------------------
            */

            if (
                response.status === 401
            ) {

                localStorage.removeItem(
                    "token"
                );

                localStorage.removeItem(
                    "selectedAccountNo"
                );

                window.location.href =
                    "login.html";

                return;

            }


            const data =
                await response.json();


            if (
                !response.ok ||
                !data.success
            ) {

                throw new Error(
                    data.message ||
                    "Unable to load virtual accounts."
                );

            }


            /*
            |--------------------------------------------------------------------------
            | STORE ACCOUNTS
            |--------------------------------------------------------------------------
            */

            accounts =
                Array.isArray(
                    data.accounts
                )
                ?
                data.accounts
                :
                [];


            console.log(
                "VIRTUAL ACCOUNTS:",
                accounts
            );


            /*
            |--------------------------------------------------------------------------
            | POPULATE UI
            |--------------------------------------------------------------------------
            */

            populateAccountSwitcher();

            populateFundWalletAccounts();

            renderAccountsTable();


        } catch (error) {

            console.error(
                "LOAD ACCOUNTS ERROR:",
                error
            );


            if (fundWalletAccountNo) {

                fundWalletAccountNo.innerHTML =
                    `
                    <option value="">
                        Unable to load accounts
                    </option>
                    `;

            }

        }

    }


    /*
    |--------------------------------------------------------------------------
    | ACCOUNT SWITCHER CHANGE
    |--------------------------------------------------------------------------
    */

    if (accountSwitcher) {

        accountSwitcher.addEventListener(
            "change",
            function () {

                const accountNo =
                    this.value;


                if (!accountNo) {

                    setSelectedAccount(
                        null
                    );

                    return;

                }


                const account =
                    accounts.find(
                        item =>
                            String(
                                item.accountno
                            ) ===
                            String(
                                accountNo
                            )
                    );


                if (account) {

                    setSelectedAccount(
                        account
                    );


                    /*
                    |--------------------------------------------------------------------------
                    | ALSO SELECT SAME ACCOUNT IN FUND WALLET
                    |--------------------------------------------------------------------------
                    */

                    if (
                        fundWalletAccountNo
                    ) {

                        fundWalletAccountNo.value =
                            account.accountno;

                    }


                    /*
                    |--------------------------------------------------------------------------
                    | REFRESH TABLE
                    |--------------------------------------------------------------------------
                    */

                    renderAccountsTable();

                }

            }
        );

    }


    /*
    |--------------------------------------------------------------------------
    | FUND WALLET ACCOUNT CHANGE
    |--------------------------------------------------------------------------
    */

    if (fundWalletAccountNo) {

        fundWalletAccountNo.addEventListener(
            "change",
            function () {

                const accountNo =
                    this.value;


                if (!accountNo) {

                    setSelectedAccount(
                        null
                    );

                    return;

                }


                const account =
                    accounts.find(
                        item =>
                            String(
                                item.accountno
                            ) ===
                            String(
                                accountNo
                            )
                    );


                if (!account) {

                    console.error(
                        "Selected account not found:",
                        accountNo
                    );

                    return;

                }


                /*
                |--------------------------------------------------------------------------
                | SET SELECTED ACCOUNT
                |--------------------------------------------------------------------------
                */

                setSelectedAccount(
                    account
                );


                /*
                |--------------------------------------------------------------------------
                | KEEP MAIN SWITCHER IN SYNC
                |--------------------------------------------------------------------------
                */

                if (accountSwitcher) {

                    accountSwitcher.value =
                        account.accountno;

                }


                renderAccountsTable();

            }
        );

    }


    /*
    |--------------------------------------------------------------------------
    | TABLE ACCOUNT SWITCH
    |--------------------------------------------------------------------------
    */

    if (accountsTableBody) {

        accountsTableBody.addEventListener(
            "click",
            function (event) {

                const button =
                    event.target.closest(
                        ".switch-account"
                    );


                if (!button) {
                    return;
                }


                const accountNo =
                    button.dataset.accountNo;


                const account =
                    accounts.find(
                        item =>
                            String(
                                item.accountno
                            ) ===
                            String(
                                accountNo
                            )
                    );


                if (!account) {
                    return;
                }


                setSelectedAccount(
                    account
                );


                if (accountSwitcher) {

                    accountSwitcher.value =
                        account.accountno;

                }


                if (fundWalletAccountNo) {

                    fundWalletAccountNo.value =
                        account.accountno;

                }


                renderAccountsTable();

            }
        );

    }


    /*
    |--------------------------------------------------------------------------
    | LOAD USER INFORMATION
    |--------------------------------------------------------------------------
    */

    async function loadUser() {

        try {

            const response =
                await fetch(
                    `${API_BASE}/auth/me`,
                    {
                        method: "GET",
                        headers:
                            authHeaders()
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


            if (
                !response.ok ||
                !data.success
            ) {

                throw new Error(
                    data.message ||
                    "Unable to load user."
                );

            }


            const user =
                data.user;


            /*
            |--------------------------------------------------------------------------
            | USER NAME
            |--------------------------------------------------------------------------
            */

            const userFullName =
                document.getElementById(
                    "userFullName"
                );


            const infoFullName =
                document.getElementById(
                    "infoFullName"
                );


            const infoPhone =
                document.getElementById(
                    "infoPhone"
                );


            const infoEmail =
                document.getElementById(
                    "infoEmail"
                );


            const infoGender =
                document.getElementById(
                    "infoGender"
                );


            const infoReferral =
                document.getElementById(
                    "infoReferral"
                );


            const topUserName =
                document.getElementById(
                    "topUserName"
                );


            const userInitials =
                document.getElementById(
                    "userInitials"
                );


            if (userFullName) {
                userFullName.textContent =
                    user.full_name ||
                    "Member";
            }


            if (infoFullName) {
                infoFullName.textContent =
                    user.full_name ||
                    "-";
            }


            if (infoPhone) {
                infoPhone.textContent =
                    user.phone_number ||
                    "-";
            }


            if (infoEmail) {
                infoEmail.textContent =
                    user.email ||
                    "-";
            }


            if (infoGender) {
                infoGender.textContent =
                    user.gender ||
                    "-";
            }


            if (infoReferral) {
                infoReferral.textContent =
                    user.referral ||
                    "-";
            }


            if (topUserName) {
                topUserName.textContent =
                    user.full_name ||
                    "Member";
            }


            if (userInitials) {

                const name =
                    user.full_name ||
                    "User";

                const parts =
                    name
                        .trim()
                        .split(/\s+/);


                userInitials.textContent =
                    parts
                        .slice(0, 2)
                        .map(
                            part =>
                                part
                                    .charAt(0)
                                    .toUpperCase()
                        )
                        .join("");

            }


            /*
            |--------------------------------------------------------------------------
            | EMAIL FOR FUND WALLET
            |--------------------------------------------------------------------------
            */

            if (fundWalletEmail) {

                fundWalletEmail.value =
                    user.email || "";

            }

        } catch (error) {

            console.error(
                "LOAD USER ERROR:",
                error
            );

        }

    }


    /*
    |--------------------------------------------------------------------------
    | COPY ACCOUNT NUMBER
    |--------------------------------------------------------------------------
    */

    const copyBankBtn =
        document.getElementById(
            "copyBankBtn"
        );


    if (copyBankBtn) {

        copyBankBtn.addEventListener(
            "click",
            async function () {

                if (
                    !selectedAccount ||
                    !selectedAccount.accountno
                ) {

                    alert(
                        "Please select a virtual account first."
                    );

                    return;

                }


                try {

                    await navigator.clipboard.writeText(
                        String(
                            selectedAccount.accountno
                        )
                    );


                    showToast(
                        "Virtual account number copied."
                    );

                } catch (error) {

                    console.error(
                        error
                    );

                    alert(
                        "Unable to copy account number."
                    );

                }

            }
        );

    }


    /*
    |--------------------------------------------------------------------------
    | TOAST
    |--------------------------------------------------------------------------
    */

    function showToast(message) {

        const toastElement =
            document.getElementById(
                "appToast"
            );

        const toastMessage =
            document.getElementById(
                "toastMessage"
            );


        if (
            !toastElement ||
            !toastMessage
        ) {

            alert(message);

            return;

        }


        toastMessage.textContent =
            message;


        const toast =
            bootstrap.Toast.getOrCreateInstance(
                toastElement
            );


        toast.show();

    }


    /*
    |--------------------------------------------------------------------------
    | FUND WALLET MODAL
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


    let fundWalletModal = null;


    if (fundWalletModalElement) {

        fundWalletModal =
            bootstrap.Modal.getOrCreateInstance(
                fundWalletModalElement
            );

    }


    if (fundWalletBtn) {

        fundWalletBtn.addEventListener(
            "click",
            function (event) {

                event.preventDefault();


                /*
                |--------------------------------------------------------------------------
                | REFRESH ACCOUNTS BEFORE OPENING
                |--------------------------------------------------------------------------
                */

                loadAccounts().then(
                    function () {

                        if (fundWalletModal) {

                            fundWalletModal.show();

                        }

                    }
                );

            }
        );

    }





    /*
    |--------------------------------------------------------------------------
    | INITIAL LOAD
    |--------------------------------------------------------------------------
    */

    async function initializeDashboard() {

        await loadUser();

        await loadAccounts();

    }


    initializeDashboard();

});
