-- =============================================================================
-- HealthChain - Hyperledger Fabric Medical Verification System
-- MySQL Database Schema
-- =============================================================================

CREATE DATABASE IF NOT EXISTS healthchain CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE healthchain;

-- =============================================================================
-- USERS TABLE
-- Stores patients, doctors, hospital admins, lab staff, and system admins.
-- Fabric identity enrollment status is tracked per user.
-- =============================================================================
CREATE TABLE IF NOT EXISTS users (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  user_id         VARCHAR(50)  UNIQUE NOT NULL COMMENT 'Prefixed UUID, e.g. PAT-uuid, DOC-uuid',
  username        VARCHAR(100) UNIQUE NOT NULL,
  email           VARCHAR(255) UNIQUE NOT NULL,
  password_hash   VARCHAR(255) NOT NULL            COMMENT 'bcrypt hash',
  role            ENUM('patient','doctor','hospital_admin','lab_staff','admin') NOT NULL,
  organization    VARCHAR(50)  NOT NULL             COMMENT 'hospitala | hospitalb | diaglab',
  fabric_identity_enrolled BOOLEAN DEFAULT FALSE,
  full_name       VARCHAR(255) NOT NULL,
  phone_hash      VARCHAR(255)                      COMMENT 'SHA-256 hash of phone, never plain-text',
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  is_active       BOOLEAN DEFAULT TRUE
);

CREATE INDEX idx_users_email        ON users(email);
CREATE INDEX idx_users_role         ON users(role);
CREATE INDEX idx_users_organization ON users(organization);
CREATE INDEX idx_users_is_active    ON users(is_active);

-- =============================================================================
-- DOCUMENTS TABLE
-- Mirrors Fabric ledger metadata for fast off-chain queries.
-- Actual file content is stored encrypted on disk; only references are here.
-- =============================================================================
CREATE TABLE IF NOT EXISTS documents (
  id                   INT AUTO_INCREMENT PRIMARY KEY,
  document_id          VARCHAR(100) UNIQUE NOT NULL,
  patient_id           VARCHAR(50)  NOT NULL,
  document_type        ENUM('CBC','BLOOD_TEST','MRI','CT','XRAY','PRESCRIPTION','LAB_REPORT','OTHER') NOT NULL,
  issuer_org           VARCHAR(50)  NOT NULL,
  issuer_user_id       VARCHAR(50)  NOT NULL,
  sha256_hash          VARCHAR(64)  NOT NULL        COMMENT 'SHA-256 hex of original plaintext file',
  encrypted_file_path  VARCHAR(500) NOT NULL        COMMENT 'Path to AES-256-GCM encrypted file on disk',
  encryption_key_ref   VARCHAR(255) NOT NULL        COMMENT 'Key reference stored in .keys/ dir; never the key itself',
  original_filename    VARCHAR(255) NOT NULL,
  file_size_bytes      BIGINT       NOT NULL,
  mime_type            VARCHAR(100) NOT NULL,
  fabric_tx_id         VARCHAR(255)                 COMMENT 'Hyperledger Fabric transaction ID',
  fabric_registered    BOOLEAN DEFAULT FALSE,
  status               ENUM('PENDING','ACTIVE','REVOKED','ARCHIVED') DEFAULT 'PENDING',
  version              INT DEFAULT 1,
  uploaded_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (patient_id) REFERENCES users(user_id) ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX idx_documents_patient_id       ON documents(patient_id);
CREATE INDEX idx_documents_document_type    ON documents(document_type);
CREATE INDEX idx_documents_issuer_org       ON documents(issuer_org);
CREATE INDEX idx_documents_status           ON documents(status);
CREATE INDEX idx_documents_fabric_tx_id     ON documents(fabric_tx_id);
CREATE INDEX idx_documents_fabric_registered ON documents(fabric_registered);
CREATE INDEX idx_documents_uploaded_at      ON documents(uploaded_at);

-- =============================================================================
-- ACCESS PERMISSIONS TABLE
-- Tracks which organizations / users have been granted access to a document.
-- Both on-chain (Fabric) and off-chain status are stored.
-- =============================================================================
CREATE TABLE IF NOT EXISTS access_permissions (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  permission_id       VARCHAR(100) UNIQUE NOT NULL,
  document_id         VARCHAR(100) NOT NULL,
  patient_id          VARCHAR(50)  NOT NULL,
  grantee_org         VARCHAR(50)  NOT NULL,
  grantee_user_id     VARCHAR(50)                   COMMENT 'NULL means entire org has access',
  status              ENUM('ACTIVE','REVOKED','EXPIRED') DEFAULT 'ACTIVE',
  granted_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  revoked_at          TIMESTAMP NULL,
  expiry_at           TIMESTAMP NULL                COMMENT 'NULL means no expiry',
  fabric_grant_tx_id  VARCHAR(255),
  fabric_revoke_tx_id VARCHAR(255),
  FOREIGN KEY (document_id) REFERENCES documents(document_id) ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX idx_ap_document_id     ON access_permissions(document_id);
CREATE INDEX idx_ap_patient_id      ON access_permissions(patient_id);
CREATE INDEX idx_ap_grantee_org     ON access_permissions(grantee_org);
CREATE INDEX idx_ap_grantee_user_id ON access_permissions(grantee_user_id);
CREATE INDEX idx_ap_status          ON access_permissions(status);
CREATE INDEX idx_ap_expiry_at       ON access_permissions(expiry_at);

-- =============================================================================
-- DOCTOR REVIEWS TABLE
-- Stores encrypted doctor reviews linked to documents.
-- Only the SHA-256 hash of the review is registered on Fabric.
-- =============================================================================
CREATE TABLE IF NOT EXISTS doctor_reviews (
  id                   INT AUTO_INCREMENT PRIMARY KEY,
  review_id            VARCHAR(100) UNIQUE NOT NULL,
  document_id          VARCHAR(100) NOT NULL,
  doctor_id            VARCHAR(50)  NOT NULL,
  doctor_org           VARCHAR(50)  NOT NULL,
  review_hash          VARCHAR(64)  NOT NULL        COMMENT 'SHA-256 hash of plaintext review content',
  encrypted_review_path VARCHAR(500)               COMMENT 'Path to AES-256-GCM encrypted review file',
  digital_signature    TEXT                         COMMENT 'Base64-encoded PKCS#7 / ECDSA signature',
  fabric_tx_id         VARCHAR(255),
  created_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (document_id) REFERENCES documents(document_id) ON DELETE RESTRICT ON UPDATE CASCADE,
  FOREIGN KEY (doctor_id)   REFERENCES users(user_id)        ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX idx_dr_document_id ON doctor_reviews(document_id);
CREATE INDEX idx_dr_doctor_id   ON doctor_reviews(doctor_id);
CREATE INDEX idx_dr_doctor_org  ON doctor_reviews(doctor_org);
CREATE INDEX idx_dr_created_at  ON doctor_reviews(created_at);

-- =============================================================================
-- AUDIT LOGS TABLE
-- Append-only event log. No medical content — only metadata.
-- =============================================================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  event_type      VARCHAR(100) NOT NULL,
  actor_user_id   VARCHAR(50),
  actor_org       VARCHAR(50),
  target_id       VARCHAR(100) COMMENT 'document_id, permission_id, review_id, etc.',
  target_type     VARCHAR(50),
  fabric_tx_id    VARCHAR(255),
  event_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ip_address      VARCHAR(45),
  user_agent      TEXT,
  success         BOOLEAN DEFAULT TRUE,
  error_message   TEXT
);

CREATE INDEX idx_al_event_type      ON audit_logs(event_type);
CREATE INDEX idx_al_actor_user_id   ON audit_logs(actor_user_id);
CREATE INDEX idx_al_actor_org       ON audit_logs(actor_org);
CREATE INDEX idx_al_target_id       ON audit_logs(target_id);
CREATE INDEX idx_al_event_timestamp ON audit_logs(event_timestamp);
CREATE INDEX idx_al_success         ON audit_logs(success);

-- =============================================================================
-- ENCRYPTION KEY REFERENCES TABLE
-- Stores references to encryption keys stored in .keys/ directory.
-- NEVER stores actual key material.
-- =============================================================================
CREATE TABLE IF NOT EXISTS encryption_key_refs (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  key_ref     VARCHAR(255) UNIQUE NOT NULL  COMMENT 'Filename / identifier in .keys/ directory',
  document_id VARCHAR(100) UNIQUE NOT NULL,
  algorithm   VARCHAR(50)  DEFAULT 'AES-256-GCM',
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_ekr_document_id ON encryption_key_refs(document_id);

-- =============================================================================
-- SEED DATA
-- Three test users: 1 patient, 1 doctor, 1 hospital admin.
-- Passwords below are bcrypt-hashed (cost factor 12):
--   patient_user  → Patient@123
--   doctor_user   → Doctor@123
--   admin_user    → Admin@123
-- Run `npm run seed:hash` in the backend to regenerate fresh hashes.
-- =============================================================================
INSERT INTO users (user_id, username, email, password_hash, role, organization, fabric_identity_enrolled, full_name, phone_hash, is_active)
VALUES
  (
    'PAT-00000001',
    'alice_patient',
    'alice@hospitala.example.com',
    -- bcrypt hash of 'Patient@123' with cost 12
    '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj/RK.s5uIFC',
    'patient',
    'hospitala',
    FALSE,
    'Alice Johnson',
    SHA2('15550001234', 256),
    TRUE
  ),
  (
    'DOC-00000001',
    'bob_doctor',
    'bob@hospitala.example.com',
    -- bcrypt hash of 'Doctor@123' with cost 12
    '$2a$12$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi',
    'doctor',
    'hospitala',
    FALSE,
    'Dr. Robert Smith',
    SHA2('15550002345', 256),
    TRUE
  ),
  (
    'ADM-00000001',
    'carol_admin',
    'carol@hospitala.example.com',
    -- bcrypt hash of 'Admin@123' with cost 12
    '$2a$12$RxKne1TOg.ckfFNbBNYMSOQFRDfcJcJBknT9Y.hLH4Hf7OlI3lRhy',
    'hospital_admin',
    'hospitala',
    FALSE,
    'Carol Williams',
    SHA2('15550003456', 256),
    TRUE
  );
