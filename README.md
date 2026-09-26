1. Business purpose

The core concept is:

Customers save a fixed amount weekly for one year and, after completing the required period, receive their principal plus a cash reward and food items.

The model you've defined includes:

Weekly savings
One-year package
Cash reward equivalent to 50% of the principal
₦10,000 worth of food items per qualifying account
Customer's savings are associated with a selected virtual account

                    CUSTOMER
                       │
                       ▼
                FOOD CONCEPT WEB APP
                       │
             HTML / CSS / JavaScript
                       │
                       ▼
                  Node.js API
                       │
        ┌──────────────┼───────────────┐
        │              │               │
        ▼              ▼               ▼
     MySQL          Paystack        Admin API
        │              │               │
        │              ▼               │
        │        Payment verification  │
        │                              │
        └──────────────┬───────────────┘
                       ▼
                 CUSTOMER WALLET
                       │
                       ▼
               VIRTUAL ACCOUNTS
                       │
                       ▼
                 FOOD CONCEPT
                  SUBSCRIPTIONS
                       │
                       ▼
               WEEKLY DEDUCTIONS
                       │
                       ▼
                  COMPLETION
                       │
                       ▼
              REWARD / CLEARANCE
