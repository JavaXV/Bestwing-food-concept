async function loadWalletBalance() {

    const token =
        localStorage.getItem("token");

    if (!token) {

        window.location.href =
            "login.html";

        return;

    }


    try {

        const response =
            await fetch(
                "/api/wallet/balance",
                {
                    method: "GET",

                    headers: {

                        "Content-Type":
                            "application/json",

                        "Authorization":
                            "Bearer " + token

                    }

                }
            );


        const result =
            await response.json();


        if (
            !response.ok ||
            !result.success
        ) {

            throw new Error(
                result.message ||
                "Unable to load wallet balance."
            );

        }


        const balance =
            Number(
                result.data?.balance || 0
            );


        const balanceCounter =
            document.getElementById(
                "balanceCounter"
            );


        if (balanceCounter) {

            balanceCounter.textContent =
                "₦" +
                balance.toLocaleString(
                    "en-NG",
                    {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                    }
                );

        }


    } catch (error) {

        console.error(
            "Wallet balance error:",
            error
        );

    }

}


document.addEventListener(
    "DOMContentLoaded",
    function () {

        loadWalletBalance();

    }
);