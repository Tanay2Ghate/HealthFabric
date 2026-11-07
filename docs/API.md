# HealthChain REST API Documentation

Base URL: `http://localhost:5000/api`

---

## 1. Authentication (`/api/auth`)

### `POST /api/auth/register`
Create a new user account.
- **Body**:
  ```json
  {
    "username": "alice_patient",
    "email": "alice@hospitala.example.com",
    "password": "Patient@123",
    "full_name": "Alice Johnson",
    "role": "patient",
    "organization": "hospitala",
    "phone": "15550001234"
  }
  ```

### `POST /api/auth/login`
Authenticate and obtain JWT.
- **Body**:
  ```json
  {
    "email": "alice@hospitala.example.com",
    "password": "Patient@123"
  }
  ```
- **Response**: `{ success: true, data: { token, expiresIn, user } }`

### `GET /api/auth/me`
Retrieve currently authenticated user profile.
- **Headers**: `Authorization: Bearer <token>`

---

## 2. Documents (`/api/documents`)

### `POST /api/documents/upload`
Upload medical file, calculate SHA-256 digest, encrypt with AES-256-GCM, and register on Fabric.
- **Headers**: `Authorization: Bearer <token>`, `Content-Type: multipart/form-data`
- **Fields**:
  - `file`: binary file (PDF, JPG, PNG)
  - `document_type`: `CBC` | `BLOOD_TEST` | `MRI` | `CT` | `XRAY` | `PRESCRIPTION` | `LAB_REPORT` | `OTHER`
  - `patient_id`: target patient ID

### `GET /api/documents`
List accessible documents based on user role and permissions.

### `GET /api/documents/:documentId/verify`
Compare off-chain file SHA-256 hash against Hyperledger Fabric ledger record.
- **Response**:
  ```json
  {
    "success": true,
    "data": {
      "documentId": "DOC-xxxx",
      "dbHash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      "onChainHash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      "verified": true
    }
  }
  ```

### `GET /api/documents/:documentId/download`
Download and decrypt the medical document.

---

## 3. Access Control (`/api/access`)

### `POST /api/access/grant`
Patient grants document retrieval permissions to another hospital.
- **Body**:
  ```json
  {
    "documentId": "DOC-xxxx",
    "granteeOrg": "hospitalb",
    "expiryDays": 30
  }
  ```

### `POST /api/access/revoke`
Patient revokes access permissions.
- **Body**:
  ```json
  {
    "documentId": "DOC-xxxx",
    "granteeOrg": "hospitalb"
  }
  ```

### `GET /api/access/my-permissions`
List all access permissions for current patient.

---

## 4. Doctor Reviews (`/api/reviews`)

### `POST /api/reviews`
Doctor records clinical observations and signed hash on the blockchain.
- **Body**:
  ```json
  {
    "documentId": "DOC-xxxx",
    "observationsSummary": "CBC test within normal parameters",
    "clinicalNotes": "Patient shows good progress, continue current prescription."
  }
  ```

### `GET /api/reviews/document/:documentId`
List all reviews for a document.

---

## 5. Blockchain Explorer (`/api/explorer`)

### `GET /api/explorer/transactions`
List audited blockchain transactions and event logs.
- **Query Params**: `type`, `page`, `limit`

### `GET /api/explorer/document/:documentId/history`
Fetch complete immutable lifecycle history from Fabric.

### `GET /api/explorer/stats`
Network statistics and ledger metrics.
