# Node.js Registration + Paystack Project

This project provides:

- Node.js + Express REST API
- MySQL database
- `PersonalInfo` table
- bcrypt password hashing
- JWT authentication
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- Paystack ₦3,000 registration payment
- Paystack payment verification
- Paystack webhook signature verification
- Bank-transfer option
- Bootstrap registration page
- Bootstrap login page
- Bootstrap dashboard
- User information loaded from the authenticated API

## 1. Requirements

Install:

- Node.js 18+
- MySQL 8+ (or compatible MySQL/MariaDB)
- A Paystack account

## 2. Create the database

Run:

```bash
mysql -u root -p < database.sql
```

Or open `database.sql` in phpMyAdmin and run it.

## 3. Install packages

```bash
npm install
```

## 4. Configure `.env`

Copy:

```text
.env.example
```

to:

```text
.env
```

Then enter your database credentials and Paystack test keys.

Never expose the Paystack secret key in browser JavaScript.

## 5. Start the API

Development:

```bash
npm run dev
```

Normal:

```bash
npm start
```

Open:

```text
http://localhost:3000/register.html
```

Health check:

```text
http://localhost:3000/api/health
```

## 6. Paystack

The backend initializes the transaction using:

```text
POST https://api.paystack.co/transaction/initialize
```

The amount is ₦3,000 = 300,000 kobo.

The server verifies the transaction before changing `payment_status` to `PAID`.

For production, configure the Paystack webhook URL:

```text
https://YOUR-DOMAIN.COM/api/payment/webhook
```

Use the Paystack test keys while developing.

## 7. Important payment security

Do not set `payment_status = PAID` just because the browser says payment succeeded.

The server verifies:

1. Paystack transaction status is `success`
2. Amount is exactly 300,000 kobo
3. Currency is NGN
4. The reference belongs to a registered user

The webhook also checks Paystack's HMAC signature.

## 8. API examples

### Register

```http
POST /api/auth/register
Content-Type: application/json
```

```json
{
  "full_name": "John Doe",
  "phone_number": "08012345678",
  "email": "john@example.com",
  "gender": "Male",
  "referral": "REF123",
  "password": "mypassword"
}
```

### Login

```http
POST /api/auth/login
Content-Type: application/json
```

```json
{
  "phone_number": "08012345678",
  "password": "mypassword"
}
```

### Current user

```http
GET /api/auth/me
Authorization: Bearer YOUR_JWT_TOKEN
```

### Initialize Paystack

```http
POST /api/payment/initialize
Authorization: Bearer YOUR_JWT_TOKEN
```

### Verify payment

```http
GET /api/payment/verify/PAYSTACK_REFERENCE
```

### Select bank transfer

```http
POST /api/payment/bank-transfer
Authorization: Bearer YOUR_JWT_TOKEN
```

## 9. Dashboard user storage

After login the frontend stores:

```javascript
localStorage.setItem("token", data.token);
localStorage.setItem("user", JSON.stringify(data.user));
```

The dashboard then calls:

```text
GET /api/auth/me
```

with:

```text
Authorization: Bearer JWT_TOKEN
```

The server retrieves the complete current user record from MySQL.

This means the dashboard can display:

- full_name
- phone_number
- email
- gender
- referral
- payment_status
- payment_method

Do not store the password in localStorage. The password is only stored as a bcrypt hash in MySQL.

## 10. Bank transfer confirmation

Bank transfer is intentionally `PENDING`.

An administrator should confirm the transfer before changing the account to `PAID`.

For example:

```sql
UPDATE PersonalInfo
SET payment_status = 'PAID'
WHERE id = 1
  AND payment_method = 'BANK_TRANSFER';
```

For a real production system, build an admin payment-confirmation endpoint instead of allowing normal users to change this value.

## 11. Production checklist

Before going live:

- Use HTTPS.
- Use Paystack live keys.
- Change `JWT_SECRET`.
- Do not commit `.env`.
- Configure Paystack webhook.
- Add rate limiting to login/register endpoints.
- Add request validation.
- Add admin authentication for bank-transfer confirmation.
- Consider secure HttpOnly cookies instead of localStorage for the JWT.
- Add database backups.
