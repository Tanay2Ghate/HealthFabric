-- =============================================================================
-- HealthChain - Hyperledger Fabric Medical Verification System
-- SQLite Database Schema
-- =============================================================================

PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

-- =============================================================================
-- USERS TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS users (
  id                       INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id                  TEXT UNIQUE NOT NULL,
  username                 TEXT UNIQUE NOT NULL,
  email                    TEXT UNIQUE NOT NULL,
  password_hash            TEXT NOT NULL,
  role                     TEXT NOT NULL CHECK(role IN ('patient','doctor','hospital_admin','lab_staff','admin')),
  organization             TEXT NOT NULL,
  fabric_identity_enrolled INTEGER DEFAULT 0,
  full_name                TEXT NOT NULL,
  phone_hash               TEXT,
  created_at               TEXT DEFAULT (datetime('now')),
  updated_at               TEXT DEFAULT (datetime('now')),
  is_active                INTEGER DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_users_email        ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role         ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_organization ON users(organization);
CREATE INDEX IF NOT EXISTS idx_users_is_active    ON users(is_active);

-- =============================================================================
-- DOCUMENTS TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS documents (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id          TEXT UNIQUE NOT NULL,
  patient_id           TEXT NOT NULL,
  document_type        TEXT NOT NULL,
  issuer_org           TEXT NOT NULL,
  issuer_user_id       TEXT NOT NULL,
  sha256_hash          TEXT NOT NULL,
  encrypted_file_path  TEXT NOT NULL,
  encryption_key_ref   TEXT NOT NULL,
  original_filename    TEXT NOT NULL,
  file_size_bytes      INTEGER NOT NULL,
  mime_type            TEXT NOT NULL,
  fabric_tx_id         TEXT,
  fabric_registered    INTEGER DEFAULT 0,
  status               TEXT DEFAULT 'PENDING' CHECK(status IN ('PENDING','ACTIVE','REVOKED','ARCHIVED')),
  version              INTEGER DEFAULT 1,
  uploaded_at          TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (patient_id) REFERENCES users(user_id)
);

CREATE INDEX IF NOT EXISTS idx_documents_patient_id   ON documents(patient_id);
CREATE INDEX IF NOT EXISTS idx_documents_type         ON documents(document_type);
CREATE INDEX IF NOT EXISTS idx_documents_issuer_org   ON documents(issuer_org);
CREATE INDEX IF NOT EXISTS idx_documents_status       ON documents(status);

-- =============================================================================
-- ACCESS PERMISSIONS TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS access_permissions (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  permission_id       TEXT UNIQUE NOT NULL,
  document_id         TEXT NOT NULL,
  patient_id          TEXT NOT NULL,
  grantee_org         TEXT NOT NULL,
  grantee_user_id     TEXT,
  status              TEXT DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','REVOKED','EXPIRED')),
  granted_at          TEXT DEFAULT (datetime('now')),
  revoked_at          TEXT,
  expiry_at           TEXT,
  fabric_grant_tx_id  TEXT,
  fabric_revoke_tx_id TEXT,
  FOREIGN KEY (document_id) REFERENCES documents(document_id)
);

CREATE INDEX IF NOT EXISTS idx_ap_document_id  ON access_permissions(document_id);
CREATE INDEX IF NOT EXISTS idx_ap_patient_id   ON access_permissions(patient_id);
CREATE INDEX IF NOT EXISTS idx_ap_grantee_org  ON access_permissions(grantee_org);
CREATE INDEX IF NOT EXISTS idx_ap_status       ON access_permissions(status);

-- =============================================================================
-- DOCTOR REVIEWS TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS doctor_reviews (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  review_id             TEXT UNIQUE NOT NULL,
  document_id           TEXT NOT NULL,
  doctor_id             TEXT NOT NULL,
  doctor_org            TEXT NOT NULL,
  review_hash           TEXT NOT NULL,
  encrypted_review_path TEXT,
  observations_summary  TEXT,
  digital_signature     TEXT,
  fabric_tx_id          TEXT,
  created_at            TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (document_id) REFERENCES documents(document_id),
  FOREIGN KEY (doctor_id)   REFERENCES users(user_id)
);

CREATE INDEX IF NOT EXISTS idx_dr_document_id ON doctor_reviews(document_id);
CREATE INDEX IF NOT EXISTS idx_dr_doctor_id   ON doctor_reviews(doctor_id);

-- =============================================================================
-- AUDIT LOGS TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type      TEXT NOT NULL,
  actor_user_id   TEXT,
  actor_org       TEXT,
  target_id       TEXT,
  target_type     TEXT,
  fabric_tx_id    TEXT,
  event_timestamp TEXT DEFAULT (datetime('now')),
  ip_address      TEXT,
  user_agent      TEXT,
  success         INTEGER DEFAULT 1,
  error_message   TEXT
);

CREATE INDEX IF NOT EXISTS idx_al_event_type ON audit_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_al_actor      ON audit_logs(actor_user_id);
CREATE INDEX IF NOT EXISTS idx_al_target     ON audit_logs(target_id);

-- =============================================================================
-- ENCRYPTION KEY REFS TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS encryption_key_refs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  key_ref     TEXT UNIQUE NOT NULL,
  document_id TEXT UNIQUE NOT NULL,
  algorithm   TEXT DEFAULT 'AES-256-GCM',
  created_at  TEXT DEFAULT (datetime('now'))
);
