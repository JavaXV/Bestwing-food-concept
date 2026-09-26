document.addEventListener(
    "DOMContentLoaded",
    async function () {


        /* =====================================================
           AUTHENTICATION
        ===================================================== */


        const token =
            localStorage.getItem(
                "token"
            );


        const savedUser =
            localStorage.getItem(
                "user"
            );


        /*
        -------------------------------------------------------
        If there is no JWT, send user back to login.
        -------------------------------------------------------
        */


        if (!token) {

            window.location.href =
                "login.html";

            return;

        }


        /*
        -------------------------------------------------------
        Read saved user.
        -------------------------------------------------------
        */


        let user = null;


        if (savedUser) {

            try {

                user =
                    JSON.parse(
                        savedUser
                    );

            }

            catch (error) {

                console.error(
                    "Unable to parse saved user:",
                    error
                );

            }

        }


        /* =====================================================
           HELPER
        ===================================================== */


        function getUserValue(
            object,
            names
        ) {


            if (!object) {

                return "";

            }


            for (
                const name of names
            ) {


                if (
                    object[name] !== undefined &&
                    object[name] !== null &&
                    object[name] !== ""
                ) {

                    return object[name];

                }

            }


            return "";

        }


        /* =====================================================
           DISPLAY USER
        ===================================================== */


        function displayUser(
            currentUser
        ) {


            if (!currentUser) {

                return;

            }


            /*
            ---------------------------------------------------
            Full name
            ---------------------------------------------------
            */


            const fullName =
                getUserValue(
                    currentUser,
                    [
                        "full_name",
                        "fullName",
                        "name"
                    ]
                );


            /*
            ---------------------------------------------------
            Phone
            ---------------------------------------------------
            */


            const phone =
                getUserValue(
                    currentUser,
                    [
                        "phone_number",
                        "phone",
                        "phoneno",
                        "phoneNo"
                    ]
                );


            /*
            ---------------------------------------------------
            Email
            ---------------------------------------------------
            */


            const email =
                getUserValue(
                    currentUser,
                    [
                        "email",
                        "email_address"
                    ]
                );


            /*
            ---------------------------------------------------
            Gender
            ---------------------------------------------------
            */


            const gender =
                getUserValue(
                    currentUser,
                    [
                        "gender"
                    ]
                );


            /*
            ---------------------------------------------------
            Referral
            ---------------------------------------------------
            */


            const referral =
                getUserValue(
                    currentUser,
                    [
                        "referral",
                        "referral_id",
                        "referralId"
                    ]
                );


            /*
            ---------------------------------------------------
            Account number
            ---------------------------------------------------
            */


            const accountNo =
                getUserValue(
                    currentUser,
                    [
                        "account_no",
                        "account_number",
                        "accountNo",
                        "virtual_account_no",
                        "virtualAccountNo"
                    ]
                );


            /*
            ---------------------------------------------------
            Account name
            ---------------------------------------------------
            */


            const accountName =
                getUserValue(
                    currentUser,
                    [
                        "account_name",
                        "accountName"
                    ]
                );


            /*
            ---------------------------------------------------
            Bank
            ---------------------------------------------------
            */


            const bankName =
                getUserValue(
                    currentUser,
                    [
                        "bank_name",
                        "bankName"
                    ]
                );


            /* =================================================
               WELCOME NAME
            ================================================= */


            const userFullName =
                document.getElementById(
                    "userFullName"
                );


            if (userFullName) {

                userFullName.textContent =
                    fullName ||
                    "Member";

            }


            /* =================================================
               TOPBAR NAME
            ================================================= */


            const topUserName =
                document.getElementById(
                    "topUserName"
                );


            if (topUserName) {


                const firstName =
                    fullName
                        .trim()
                        .split(/\s+/)[0];


                topUserName.textContent =
                    firstName ||
                    "Member";

            }


            /* =================================================
               INITIALS
            ================================================= */


            const userInitials =
                document.getElementById(
                    "userInitials"
                );


            if (userInitials) {


                const names =
                    fullName
                        .trim()
                        .split(/\s+/)
                        .filter(Boolean);


                let initials =
                    "U";


                if (
                    names.length >= 2
                ) {

                    initials =
                        names[0]
                            .charAt(0)
                        +
                        names[1]
                            .charAt(0);

                }


                else if (
                    names.length === 1
                ) {

                    initials =
                        names[0]
                            .charAt(0);

                }


                userInitials.textContent =
                    initials.toUpperCase();

            }


            /* =================================================
               ACCOUNT NUMBER
            ================================================= */


            const userAccountNo =
                document.getElementById(
                    "userAccountNo"
                );


            if (userAccountNo) {

                userAccountNo.textContent =
                    accountNo ||
                    "Not assigned";

            }


            /* =================================================
               USER INFORMATION
            ================================================= */


            const infoFullName =
                document.getElementById(
                    "infoFullName"
                );


            if (infoFullName) {

                infoFullName.textContent =
                    fullName ||
                    "Not available";

            }


            const infoPhone =
                document.getElementById(
                    "infoPhone"
                );


            if (infoPhone) {

                infoPhone.textContent =
                    phone ||
                    "Not available";

            }


            const infoEmail =
                document.getElementById(
                    "infoEmail"
                );


            if (infoEmail) {

                infoEmail.textContent =
                    email ||
                    "Not available";

            }


            const infoGender =
                document.getElementById(
                    "infoGender"
                );


            if (infoGender) {

                infoGender.textContent =
                    gender ||
                    "Not available";

            }


            const infoReferral =
                document.getElementById(
                    "infoReferral"
                );


            if (infoReferral) {

                infoReferral.textContent =
                    referral ||
                    "None";

            }


            const infoAccountNo =
                document.getElementById(
                    "infoAccountNo"
                );


            if (infoAccountNo) {

                infoAccountNo.textContent =
                    accountNo ||
                    "Not assigned";

            }


            /* =================================================
               VIRTUAL ACCOUNT CARD
            ================================================= */


            const bankAccountNumber =
                document.getElementById(
                    "bankAccountNumber"
                );


            if (bankAccountNumber) {


                if (accountNo) {


                    /*
                    Format 10 digit number:
                    1234567890
                    becomes
                    1234 5678 90
                    */


                    const cleanAccount =
                        String(
                            accountNo
                        )
                        .replace(
                            /\D/g,
                            ""
                        );


                    if (
                        cleanAccount.length === 10
                    ) {

                        bankAccountNumber.textContent =
                            cleanAccount.slice(0, 4)
                            + " "
                            + cleanAccount.slice(4, 8)
                            + " "
                            + cleanAccount.slice(8);

                    }

                    else {

                        bankAccountNumber.textContent =
                            accountNo;

                    }


                }

                else {

                    bankAccountNumber.textContent =
                        "Not assigned";

                }

            }


            /* =================================================
               BANK ACCOUNT NAME
            ================================================= */


            const bankAccountName =
                document.getElementById(
                    "bankAccountName"
                );


            if (bankAccountName) {


                bankAccountName.textContent =
                    accountName ||
                    fullName ||
                    "Not assigned";

            }


            /* =================================================
               BANK NAME
            ================================================= */


            if (bankName) {


                const bankNameElement =
                    document.getElementById(
                        "bankName"
                    );


                const bankNameCard =
                    document.getElementById(
                        "bankNameCard"
                    );


                if (bankNameElement) {

                    bankNameElement.textContent =
                        bankName;

                }


                if (bankNameCard) {

                    bankNameCard.textContent =
                        bankName;

                }

            }


            /* =================================================
               ACCOUNT SWITCHER
            ================================================= */


            const accountSwitcher =
                document.getElementById(
                    "accountSwitcher"
                );


            if (accountSwitcher) {


                accountSwitcher.innerHTML = "";


                const option =
                    document.createElement(
                        "option"
                    );


                option.value =
                    accountNo || "";


                option.textContent =
                    accountNo
                        ? accountNo + " — Primary"
                        : "No account assigned";


                option.selected =
                    true;


                accountSwitcher.appendChild(
                    option
                );

            }


            /* =================================================
               ACCOUNT TABLE
            ================================================= */


            const tableAccountNo =
                document.getElementById(
                    "tableAccountNo"
                );


            if (tableAccountNo) {

                tableAccountNo.textContent =   
                    accountNo ||
                    "Not assigned";

            }


            /* =================================================
               LOGIN ACTIVITY
            ================================================= */


            const loginActivity =
                document.getElementById(
                    "loginActivity"
                );


            if (loginActivity) {


                const now =
                    new Date();


                loginActivity.textContent =
                    phone
                        ? phone +
                          " • Current session"
                        : "Current session";

            }

        }


        /* =====================================================
           DISPLAY SAVED DATA FIRST
        ===================================================== */


        if (user) {

            displayUser(
                user
            );

        }


        /* =====================================================
           GET FRESH USER INFORMATION
        ===================================================== */


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


            /*
            ---------------------------------------------------
            Read response
            ---------------------------------------------------
            */


            const data =
                await response.json();


            console.log(
                "ME API RESPONSE:",
                data
            );


            /*
            ---------------------------------------------------
            Unauthorized
            ---------------------------------------------------
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
            ---------------------------------------------------
            Other API error
            ---------------------------------------------------
            */


            if (!response.ok) {

                console.error(
                    "User API error:",
                    data
                );

            }


            else {


                /*
                ------------------------------------------------
                Find user object
                ------------------------------------------------
                */


                const freshUser =
                    data.user ||
                    data.data ||
                    data;


                if (freshUser) {


                    user =
                        freshUser;


                    /*
                    ------------------------------------------------
                    Save fresh user
                    ------------------------------------------------
                    */


                    localStorage.setItem(
                        "user",
                        JSON.stringify(
                            user
                        )
                    );


                    /*
                    ------------------------------------------------
                    Display fresh user
                    ------------------------------------------------
                    */


                    displayUser(
                        user
                    );

                }

            }


        }


        catch (error) {


            console.error(
                "Unable to load user:",
                error
            );


            /*
            ---------------------------------------------------
            We do NOT immediately logout here.
            Saved user information can still be displayed if
            the temporary API request failed.
            ---------------------------------------------------
            */

        }


        /* =====================================================
           MOBILE SIDEBAR
        ===================================================== */


        const sidebar =
            document.getElementById(
                "sidebar"
            );


        const overlay =
            document.getElementById(
                "overlay"
            );


        const menuBtn =
            document.getElementById(
                "menuBtn"
            );


        function closeSidebar() {


            sidebar?.classList.remove(
                "show"
            );


            overlay?.classList.remove(
                "show"
            );

        }


        menuBtn?.addEventListener(
            "click",
            function () {


                sidebar.classList.toggle(
                    "show"
                );


                overlay.classList.toggle(
                    "show"
                );

            }
        );


        overlay?.addEventListener(
            "click",
            closeSidebar
        );


        /* =====================================================
           GREETING
        ===================================================== */


        const hour =
            new Date().getHours();


        let greeting =
            "Good Evening";


        if (
            hour < 12
        ) {

            greeting =
                "Good Morning";

        }


        else if (
            hour < 17
        ) {

            greeting =
                "Good Afternoon";

        }


        const greetingElement =
            document.getElementById(
                "greeting"
            );


        if (greetingElement) {

            greetingElement.textContent =
                greeting;

        }


        /* =====================================================
           COUNTER ANIMATION
        ===================================================== */


        document
            .querySelectorAll(
                "[data-counter]"
            )
            .forEach(
                function (el) {


                    const target =
                        Number(
                            el.dataset.counter
                        );


                    let current =
                        0;


                    const duration =
                        700;


                    const start =
                        performance.now();


                    function animate(
                        now
                    ) {


                        const progress =
                            Math.min(
                                (
                                    now -
                                    start
                                ) /
                                duration,
                                1
                            );


                        current =
                            Math.floor(
                                progress *
                                target
                            );


                        el.textContent =
                            current.toLocaleString();


                        if (
                            progress < 1
                        ) {


                            requestAnimationFrame(
                                animate
                            );

                        }


                        else {


                            el.textContent =
                                target.toLocaleString();

                        }

                    }


                    requestAnimationFrame(
                        animate
                    );


                }
            );


        /* =====================================================
           CHART
        ===================================================== */


        const ctx =
            document.getElementById(
                "contributionChart"
            );


        if (ctx) {


            new Chart(
                ctx,
                {

                    type: "line",

                    data: {

                        labels: [

                            "Jan",
                            "Feb",
                            "Mar",
                            "Apr",
                            "May",
                            "Jun",
                            "Jul",
                            "Aug",
                            "Sep",
                            "Oct",
                            "Nov",
                            "Dec"

                        ],

                        datasets: [{

                            label:
                                "Contributions",

                            data: [

                                0,
                                0,
                                850,
                                1391,
                                1391,
                                1391,
                                1391,
                                1391,
                                1391,
                                1391,
                                1391,
                                1391

                            ],

                            borderWidth: 2,

                            tension: .4,

                            fill: true

                        }]

                    },


                    options: {

                        responsive: true,

                        maintainAspectRatio:
                            false,


                        plugins: {

                            legend: {

                                display:
                                    false

                            }

                        },


                        scales: {

                            y: {

                                beginAtZero:
                                    true,


                                ticks: {

                                    callback:
                                        function (
                                            value
                                        ) {

                                            return (
                                                "₦" +
                                                Number(
                                                    value
                                                )
                                                .toLocaleString()
                                            );

                                        }

                                },


                                grid: {

                                    color:
                                        "#eef2f7"

                                }

                            },


                            x: {

                                grid: {

                                    display:
                                        false

                                }

                            }

                        }

                    }

                }
            );

        }


        /* =====================================================
           TOAST
        ===================================================== */


        const toastElement =
            document.getElementById(
                "appToast"
            );


        const toast =
            bootstrap.Toast
                .getOrCreateInstance(
                    toastElement
                );


        function showToast(
            message
        ) {


            document.getElementById(
                "toastMessage"
            ).textContent =
                message;


            toast.show();

        }


        /* =====================================================
           COPY ACCOUNT NUMBER
        ===================================================== */


        document
            .getElementById(
                "copyBankBtn"
            )
            ?.addEventListener(
                "click",
                async function () {


                    const accountNo =
                        getUserValue(
                            user,
                            [
                                "account_no",
                                "account_number",
                                "accountNo",
                                "virtual_account_no",
                                "virtualAccountNo"
                            ]
                        );


                    if (!accountNo) {


                        showToast(
                            "Virtual account number is not available."
                        );


                        return;

                    }


                    try {


                        await navigator
                            .clipboard
                            .writeText(
                                String(
                                    accountNo
                                )
                            );


                        showToast(
                            "Account number copied."
                        );


                    }


                    catch (error) {


                        showToast(
                            "Unable to copy automatically. Account: " +
                            accountNo
                        );

                    }

                }
            );


        /* =====================================================
           ACCOUNT SWITCHER
        ===================================================== */


        document
            .getElementById(
                "accountSwitcher"
            )
            ?.addEventListener(
                "change",
                function (event) {


                    const account =
                        event.target.value;


                    if (!account) {

                        return;

                    }


                    showToast(
                        "Selected account: " +
                        account
                    );

                }
            );


        /* =====================================================
           SWITCH ACCOUNT BUTTON
        ===================================================== */


        document
            .querySelectorAll(
                ".switch-account"
            )
            .forEach(
                function (button) {


                    button.addEventListener(
                        "click",
                        function () {


                            const account =
                                user
                                    ? getUserValue(
                                        user,
                                        [
                                            "account_no",
                                            "account_number",
                                            "accountNo"
                                        ]
                                    )
                                    : "";


                            if (account) {


                                const switcher =
                                    document
                                        .getElementById(
                                            "accountSwitcher"
                                        );


                                if (switcher) {

                                    switcher.value =
                                        account;

                                }


                                showToast(
                                    "Selected account: " +
                                    account
                                );

                            }

                        }
                    );

                }
            );


        /* =====================================================
           SEARCH
        ===================================================== */


        document
            .getElementById(
                "globalSearch"
            )
            ?.addEventListener(
                "input",
                function (event) {


                    const term =
                        event.target.value
                            .toLowerCase()
                            .trim();


                    document
                        .querySelectorAll(
                            ".quick-action, .activity, .announcement, tbody tr"
                        )
                        .forEach(
                            function (item) {


                                item.style.display =
                                    !term ||
                                    item.textContent
                                        .toLowerCase()
                                        .includes(
                                            term
                                        )
                                        ? ""
                                        : "none";

                            }
                        );

                }
            );


        /* =====================================================
           DISMISS ANNOUNCEMENTS
        ===================================================== */


        document
            .getElementById(
                "dismissAnnouncements"
            )
            ?.addEventListener(
                "click",
                function () {


                    document
                        .getElementById(
                            "announcementList"
                        )
                        .innerHTML = `

                            <div
                                class="
                                    text-center
                                    py-4
                                    text-muted
                                    small
                                "
                            >

                                <i
                                    class="
                                        bi
                                        bi-check-circle
                                        fs-3
                                        d-block
                                        mb-2
                                    "
                                ></i>

                                Announcements dismissed
                                for this session.

                            </div>

                        `;

                }
            );


// ============================================================
// ADD ACCOUNT
// ============================================================

const ADD_ACCOUNT_FEE =
    3000;


let addAccountModal = null;


// ============================================================
// SHOW ADD ACCOUNT MODAL
// ============================================================

document
    .querySelectorAll(
        "#addAccountBtn, #addAccountBtnSidebar"
    )
    .forEach(
        function (button) {

            button.addEventListener(
                "click",
                async function (event) {

                    event.preventDefault();

                    const modalElement =
                        document.getElementById(
                            "addAccountModal"
                        );

                    if (!modalElement) {

                        alert(
                            "Add Account payment window was not found."
                        );

                        return;
                    }

                    /*
                     * Make sure the selected account is loaded
                     * before reading its balance.
                     */
                    const switcher =
                        document.getElementById(
                            "accountSwitcher"
                        );

                    const selectedOption =
                        switcher?.options[
                            switcher.selectedIndex
                        ];

                    const selectedAccountNo =
                        selectedOption?.dataset?.accountNo ||
                        "";

                    if (
                        selectedAccountNo &&
                        (
                            typeof currentAccount === "undefined" ||
                            !currentAccount ||
                            currentAccount.accountno !== selectedAccountNo
                        )
                    ) {
                        await loadSelectedAccount(
                            selectedAccountNo
                        );
                    }

                    addAccountModal =
                        bootstrap.Modal.getOrCreateInstance(
                            modalElement
                        );

                    addAccountModal.show();

                    await loadAddAccountBalance();
                }
            );
        }
    );


// ============================================================
// GET CURRENT SELECTED ACCOUNT NUMBER
// ============================================================

function getCurrentSelectedAccountNo() {

    /*
    ------------------------------------------------------------
    | FIRST: CURRENT ACCOUNT OBJECT
    ------------------------------------------------------------
    */

    if (
        typeof currentAccount !==
        "undefined" &&
        currentAccount &&
        currentAccount.accountno
    ) {

        return currentAccount.accountno;

    }


    /*
    ------------------------------------------------------------
    | SECOND: SAVED ACCOUNT
    ------------------------------------------------------------
    */

    try {

        const saved =
            JSON.parse(
                localStorage.getItem(
                    "selectedAccount"
                ) || "null"
            );


        if (
            saved &&
            saved.accountNo
        ) {

            return saved.accountNo;

        }

    } catch (error) {

        console.error(
            "Selected account error:",
            error
        );

    }


    return null;
}




// ============================================================
// SHOW MANUAL PAYMENT
// ============================================================

document
    .getElementById(
        "manualAddAccountBtn"
    )
    ?.addEventListener(
        "click",
        function () {

            const box =
                document.getElementById(
                    "manualAddAccountBox"
                );


            if (!box) {
                return;
            }


            box.classList.toggle(
                "d-none"
            );

        }
    );


// ============================================================
// SUBMIT MANUAL PAYMENT
// ============================================================

document
    .getElementById(
        "submitManualAddAccountBtn"
    )
    ?.addEventListener(
        "click",
        async function () {

            const button =
                this;


            const token =
                localStorage.getItem(
                    "token"
                );


            if (!token) {

                window.location.href =
                    "login.html";

                return;
            }


            button.disabled =
                true;


            button.innerHTML =
                `
                <span
                    class="spinner-border
                    spinner-border-sm
                    me-2"
                ></span>
                Submitting...
                `;


            try {

                const response =
                    await fetch(
                        "/api/auth/accounts/add/manual",
                        {
                            method:
                                "POST",

                            headers: {

                                "Content-Type":
                                    "application/json",

                                "Authorization":
                                    "Bearer " +
                                    token

                            },

                            body:
                                JSON.stringify({})

                        }
                    );


                const data =
                    await response.json();


                if (
                    !response.ok ||
                    !data.success
                ) {

                    throw new Error(
                        data.message ||
                        "Unable to submit manual payment."
                    );

                }


                alert(
                    "Manual payment request submitted successfully.\n\n" +
                    "Account Number: " +
                    data.data.accountno +
                    "\n\n" +
                    "The account will be activated after the payment is approved."
                );


                if (addAccountModal) {
                    addAccountModal.hide();
                }


                /*
                --------------------------------------------------
                | REFRESH ACCOUNT LIST
                --------------------------------------------------
                */

                if (
                    typeof loadAccounts ===
                    "function"
                ) {

                    await loadAccounts();

                }


            } catch (error) {

                console.error(
                    "Manual add account error:",
                    error
                );


                alert(
                    error.message ||
                    "Unable to submit manual payment."
                );


            } finally {

                button.disabled =
                    false;


                button.innerHTML =
                    `
                    I Have Made The Transfer
                    `;

            }

        }
    );


        /* =====================================================
           LOGOUT
        ===================================================== */


        document
            .querySelectorAll(
                ".logout-link"
            )
            .forEach(
                function (link) {


                    link.addEventListener(
                        "click",
                        function (event) {


                            event.preventDefault();


                            /*
                            -----------------------------------
                            Remove authentication data
                            -----------------------------------
                            */


                            localStorage.removeItem(
                                "token"
                            );


                            localStorage.removeItem(
                                "user"
                            );


                            /*
                            -----------------------------------
                            Redirect to login
                            -----------------------------------
                            */


                            window.location.href =
                                "login.html";

                        }
                    );

                }
            );


        /* =====================================================
           RESIZE
        ===================================================== */


        window.addEventListener(
            "resize",
            function () {


                if (
                    window.innerWidth >= 992
                ) {

                    closeSidebar();

                }

            }
        );


    }

);
