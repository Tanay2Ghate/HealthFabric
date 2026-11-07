# HealthChain — Setup & Quickstart Guide

Hyperledger Fabric-Based Decentralized Medical Document Management and Verification System

---

## 📋 Technology Stack Overview

- **Frontend**: React.js 18, Tailwind CSS, Vite, Lucide Icons, React Query
- **Backend**: Node.js 20+, Express.js, JWT Authentication, RBAC
- **Database**: SQLite with WAL Mode & Auto-Migration (zero MySQL installation needed!)
- **File Encryption**: AES-256-GCM authenticated encryption off-chain with per-document keys
- **Hashing**: SHA-256 cryptographic digests
- **Blockchain**: Hyperledger Fabric 2.5 (3-Organization Network: Hospital A, Hospital B, Diagnostic Lab)
- **Chaincode**: JavaScript Smart Contract (`healthchain-cc`) on `healthchainchannel`
- **Gateway**: Hyperledger Fabric Gateway client (`@hyperledger/fabric-gateway`)

---

## 🚀 Instant Quickstart (Development Mode)

HealthChain includes an automated SQLite database engine and intelligent Fabric mock/live gateway switching. You can run the entire frontend and backend immediately without waiting for Docker or Fabric!

### 1. Start the Backend

```bash
cd backend
npm install
npm start
```
*Backend starts on `http://localhost:5000`.*
*The SQLite database (`healthchain.db`) is automatically initialized and seeded with test accounts on the first run.*

### 2. Start the Frontend

```bash
cd frontend
npm install
npm run dev
```
*Frontend opens on `http://localhost:3000` (or `http://localhost:5173`).*

---

## 🔑 Pre-Seeded Test Credentials

| Role | Organization | Email | Password |
|------|-------------|-------|----------|
| **Patient (Alice)** | Hospital A | `alice@hospitala.example.com` | `Patient@123` |
| **Doctor (Dr. Robert)** | Hospital A | `bob@hospitala.example.com` | `Doctor@123` |
| **Hospital Admin (Carol)** | Hospital A | `carol@hospitala.example.com` | `Admin@123` |
| **Hospital B Admin (David)** | Hospital B | `david@hospitalb.example.com` | `Admin@123` |
| **Lab Staff** | Diagnostic Lab | `lab@diaglab.example.com` | `Lab@12345` |

*(Quick-fill buttons are also provided directly on the login screen for 1-click login.)*

---

## 🏥 End-to-End Workflow Demonstration

1. **Upload & Register Report**:
   - Log in as Hospital Admin or Patient (`alice@hospitala.example.com`).
   - Upload a test medical document (PDF, PNG, JPG).
   - System validates magic bytes, computes SHA-256 hash, encrypts the file with AES-256-GCM, and commits the transaction to the ledger.
2. **Patient Access Granting**:
   - Log in as Patient (`alice@hospitala.example.com`).
   - Go to **Access Management** → Click **Grant Access**.
   - Select the document and choose **Hospital B (Partner Hospital)**.
   - The permission transaction is submitted to the blockchain.
3. **Cross-Hospital Doctor Review**:
   - Log in as Doctor (`bob@hospitala.example.com`).
   - Go to **Patient Documents**.
   - Verify the SHA-256 hash against the Fabric ledger (`VERIFIED: Hashes Match`).
   - Click **Add Clinical Review**. Enter observations and submit with digital signature.
4. **Access Revocation**:
   - Log back in as Patient → Click **Revoke Access** on Hospital B.
   - Future document requests from unauthorized organizations are blocked.
5. **Ledger Audit & Blockchain Explorer**:
   - Open **Blockchain Explorer** to see every transaction ID, event type, initiating organization, and timestamp.
   - Search by Document ID to see the complete immutable lifecycle trace.

---

## 🐳 Running with Hyperledger Fabric (Docker)

### Prerequisites:
- Docker Desktop with WSL2 (Windows) or native Linux/macOS
- Fabric 2.5 docker images (`hyperledger/fabric-peer:2.5`, `hyperledger/fabric-orderer:2.5`)

### Start the Fabric Network:
```powershell
cd fabric-network/scripts
.\network.ps1 up
```
*(On Linux/macOS: `./network.sh up`)*

### Deploy Chaincode:
```bash
./deploy-cc.sh
```

### Connect Backend to Real Fabric:
In `backend/.env`, set:
```ini
FABRIC_MOCK_MODE=false
```
Then restart the backend (`npm start`).
