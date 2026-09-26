CREATE DATABASE IF NOT EXISTS registration_system CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE registration_system;

CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(150) NOT NULL,
  email VARCHAR(190) NOT NULL UNIQUE,
  phone_number VARCHAR(30) NOT NULL UNIQUE,
  gender ENUM('Male','Female','Other') NOT NULL,
  referral VARCHAR(150) NULL,
  password_hash VARCHAR(255) NOT NULL,
  payment_status ENUM('unpaid','pending','paid') NOT NULL DEFAULT 'unpaid',
  account_status ENUM('pending_payment','active') NOT NULL DEFAULT 'pending_payment',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS payments (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  method ENUM('paystack','manual') NOT NULL,
  amount INT UNSIGNED NOT NULL,
  reference VARCHAR(100) NOT NULL UNIQUE,
  status ENUM('pending','success','awaiting_manual_approval','failed','rejected') NOT NULL DEFAULT 'pending',
  gateway_response VARCHAR(255) NULL,
  approved_by VARCHAR(100) NULL,
  approved_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_payments_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_payments_user (user_id),
  INDEX idx_payments_status (status)
);

CREATE TABLE IF NOT EXISTS virtual_account (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL UNIQUE,
  accountno CHAR(10) NOT NULL UNIQUE,
  account_name VARCHAR(150) NOT NULL,
  status ENUM('active','inactive') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_virtual_account_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS admin_users (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  phone_number VARCHAR(30) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
