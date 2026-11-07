# HealthChain: Teacher Demonstration & Evaluation Guide

**Hyperledger Fabric-Based Decentralized Medical Document Management & Verification System**

---

## ⚡ 1. How to Start the Project (Anytime)

Open two PowerShell / Command Prompt windows:

### Terminal 1 — Backend API (SQLite & Fabric Gateway)
```powershell
cd "c:\Users\ghate\OneDrive\Desktop\hyperledger medical verification system\backend"
npm start
```
*Backend runs on: `http://localhost:5000`*

### Terminal 2 — Frontend Web Application (React + Vite)
```powershell
cd "c:\Users\ghate\OneDrive\Desktop\hyperledger medical verification system\frontend"
npm run dev
```
*Frontend runs on: `http://localhost:3000`*

---

## 🌐 2. All Application Links

| Destination | Direct URL | Description |
| :--- | :--- | :--- |
| **Login Portal** | [http://localhost:3000/login](http://localhost:3000/login) | Authentication page with 1-click test buttons |
| **Patient Dashboard** | [http://localhost:3000/patient/dashboard](http://localhost:3000/patient/dashboard) | Patient health overview, metrics, quick actions |
| **Patient Documents** | [http://localhost:3000/patient/documents](http://localhost:3000/patient/documents) | Document upload, download, and hash verification |
| **Access Management** | [http://localhost:3000/patient/access](http://localhost:3000/patient/access) | Grant and revoke cross-hospital access permissions |
| **Doctor Dashboard** | [http://localhost:3000/doctor/dashboard](http://localhost:3000/doctor/dashboard) | Doctor metrics, accessible counts, reviews written |
| **Accessible Patient Docs** | [http://localhost:3000/doctor/patients](http://localhost:3000/doctor/patients) | Review accessible files, hash verification, download |
| **Doctor Reviews** | [http://localhost:3000/doctor/reviews](http://localhost:3000/doctor/reviews) | Signed clinical observations & digital signatures |
| **Hospital Admin Dashboard** | [http://localhost:3000/hospital/dashboard](http://localhost:3000/hospital/dashboard) | Hospital node management, metrics, registrations |
| **Hospital Documents** | [http://localhost:3000/hospital/documents](http://localhost:3000/hospital/documents) | Upload & register reports on behalf of patients |
| **Hospital Access Grants** | [http://localhost:3000/hospital/access](http://localhost:3000/hospital/access) | Cross-organization active permission audit |
| **Blockchain Explorer** | [http://localhost:3000/explorer](http://localhost:3000/explorer) | Immutable ledger transactions & document lifecycle |
| **Backend Health Check** | [http://localhost:5000/api/health](http://localhost:5000/api/health) | API status & Fabric mock/live gateway indicator |

---

## 🔑 3. Pre-Seeded Test Accounts

*(On the login screen, clicking any button logs in instantly with 1 click)*

| Role | Email / Username | Password | Organization | Key Permissions |
| :--- | :--- | :--- | :--- | :--- |
| **👤 Patient (Alice)** | `alice@hospitala.example.com` | `Patient@123` | Hospital A | Upload, view, grant/revoke permissions |
| **🩺 Doctor (Dr. Robert)** | `bob@hospitala.example.com` | `Doctor@123` | Hospital A | Verify hash, download, add signed clinical review |
| **🏥 Admin (Carol)** | `carol@hospitala.example.com` | `Admin@123` | Hospital A | Register documents for patients, monitor stats |
| **🏥 Admin B (David)** | `david@hospitalb.example.com` | `Admin@123` | Hospital B | Partner hospital node (tests cross-hospital sharing) |
| **👤 Your Personal Account** | `ghatetanay02@gmail.com` | `Patient@123` | Hospital A | Registered patient account |

---

## 🎓 4. Step-by-Step Teacher Demonstration Script

Follow these 6 steps to demonstrate the complete lifecycle to your professor:

### Step 1: Explain the Core Problem & Solution (30 seconds)
> *"Traditional healthcare systems store records in centralized hospital silos, making cross-hospital sharing slow and document tampering hard to detect. HealthChain solves this using Hyperledger Fabric. Medical files are encrypted off-chain with AES-256-GCM, while only the SHA-256 cryptographic hashes and access permissions are recorded on the blockchain ledger."*

### Step 2: Upload & Blockchain Anchor (1 minute)
1. Open **[http://localhost:3000/login](http://localhost:3000/login)**.
2. Click **`👤 Patient`** (Alice Johnson).
3. Go to **[My Documents](http://localhost:3000/patient/documents)**.
4. Click **`Upload Document`**:
   - Choose any PDF or image report.
   - Select Document Type: **`CBC`** or **`Lab Report`**.
   - Click **`Upload`**.
5. **Show your teacher:**
   - The file was validated by magic bytes.
   - Its SHA-256 hash was computed.
   - The file was AES-256 encrypted and saved in `backend/uploads/encrypted/`.
   - The document ID and hash were committed to Hyperledger Fabric.

### Step 3: Grant Cross-Hospital Permission (1 minute)
1. Go to **[Access Management](http://localhost:3000/patient/access)**.
2. Click **`Grant Access`**:
   - Select the document you just uploaded.
   - Choose Organization: **`Hospital B (Partner Hospital)`**.
   - Set Expiry: `30` days (or leave blank for indefinite).
   - Click **`Grant Access`**.
3. **Show your teacher:**
   - The permission transaction `AccessGranted` was recorded on Fabric.
   - Hospital B now has authorized access through smart contract policy.

### Step 4: Doctor Verification & Signed Review (1.5 minutes)
1. Log out (top right) and click **`🩺 Doctor`** (Dr. Robert Smith).
2. Go to **[Patient Documents](http://localhost:3000/doctor/patients)**:
   - Click **`Verify Hash`**: Show the green **`VERIFIED: Hashes Match`** badge! Explain that the frontend fetched the file, recomputed the SHA-256 digest, and confirmed it matches the immutable blockchain record.
   - Click **`Download`**: Shows how authorized doctors can retrieve the decrypted plaintext file.
   - Click **`Add Clinical Review`**:
     - Summary: `Blood counts optimal, no abnormalities`
     - Notes: `Patient cleared for routine follow-up in 12 months.`
     - Click **`Sign & Submit Review`**.
3. Go to **[My Reviews](http://localhost:3000/doctor/reviews)**:
   - Click **`View Details`**: Show the **Digital Signature** and **Review SHA-256 Hash** committed to the ledger.

### Step 5: Revoke Access & Verify Denial (1 minute)
1. Log back in as **`👤 Patient`** (Alice).
2. Go to **[Access Management](http://localhost:3000/patient/access)**.
3. Click **`Revoke`** next to Hospital B.
4. Log in as **`Hospital B Admin`** (`david@hospitalb.example.com` / `Admin@123`).
5. **Show your teacher:** Hospital B is now blocked with **`403 Forbidden`** when attempting to retrieve the file. The revocation is immutably enforced!

### Step 6: Blockchain Explorer Audit Trail (1 minute)
1. Open **[Blockchain Explorer](http://localhost:3000/explorer)**.
2. **Show your teacher:**
   - The complete chronological block transactions: `RegisterDocument`, `GrantAccess`, `AddDoctorReview`, `RevokeAccess`.
   - Each transaction shows: Tx ID, Initiating Organization (`hospitala`, `hospitalb`), Timestamp, and Status.
   - In the search bar, paste your Document ID (e.g. `DOC-xxxx`) to trace the entire lifecycle history of that single document from creation to review and revocation.
   - Emphasize the **Privacy Guarantee**: No PII or medical data is ever exposed in the explorer—only cryptographic proofs and metadata.

---

## 💥 5. Bonus: The Tamper-Detection Demonstration

Professors love seeing a live cryptographic tamper test. Here is how to show it:

1. Open a terminal and run the built-in automated test suite:
```powershell
cd "c:\Users\ghate\OneDrive\Desktop\hyperledger medical verification system"
node tests/e2e-demo.js
```
2. It automatically runs all 8 phases of the spec and prints green checkmarks for every requirement!
