CREATE DATABASE IF NOT EXISTS registration_payment_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE registration_payment_db;
CREATE TABLE IF NOT EXISTS users (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 full_name VARCHAR(150) NOT NULL,
 email VARCHAR(190) NOT NULL UNIQUE,
 phone_number VARCHAR(30) NOT NULL UNIQUE,
 gender ENUM('Male','Female','Other') NOT NULL,
 referral VARCHAR(100) NULL,
 password_hash VARCHAR(255) NOT NULL,
 payment_status ENUM('unpaid','manual_pending','paid') NOT NULL DEFAULT 'unpaid',
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS payments (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 user_id BIGINT UNSIGNED NOT NULL,
 method ENUM('paystack','manual') NOT NULL,
 reference VARCHAR(120) NOT NULL UNIQUE,
 amount INT NOT NULL,
 currency VARCHAR(10) NOT NULL DEFAULT 'NGN',
 status ENUM('pending','awaiting_manual_approval','paid','rejected','failed') NOT NULL DEFAULT 'pending',
 gateway_transaction_id VARCHAR(100) NULL,
 payer_name VARCHAR(150) NULL,
 proof TEXT NULL,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 paid_at DATETIME NULL,
 CONSTRAINT fk_pay_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
 INDEX idx_pay_user(user_id), INDEX idx_pay_status(status)
);
CREATE TABLE IF NOT EXISTS virtual_accounts (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 user_id BIGINT UNSIGNED NOT NULL UNIQUE,
 account_no CHAR(10) NOT NULL UNIQUE,
 status ENUM('active','inactive') NOT NULL DEFAULT 'active',
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT fk_va_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS admins (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 full_name VARCHAR(150) NOT NULL,
 phone_number VARCHAR(30) NOT NULL UNIQUE,
 password_hash VARCHAR(255) NOT NULL,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
-- Run: node scripts/create-admin.js after npm install to create your admin account.
