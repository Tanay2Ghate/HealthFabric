'use strict';

/**
 * HealthChain Hyperledger Fabric Chaincode
 *
 * Manages medical document registration, verification, access control,
 * and doctor reviews across three organizations:
 *   Org1MSP  – HospitalA
 *   Org2MSP  – HospitalB
 *   Org3MSP  – DiagnosticLab
 *
 * Design principles
 * -----------------
 * - Medical content (prescriptions, diagnoses, raw notes) is NEVER stored
 *   on-ledger. Only hashes, metadata, and access tokens are recorded.
 * - All state keys are prefixed with a logical type to avoid collisions:
 *     PATIENT::{patientId}
 *     HOSPITAL::{hospitalId}
 *     DOCUMENT::{documentId}
 *     REVIEW::{reviewId}
 * - Access records use a composite key: documentId~granteeOrg → {documentId, granteeOrg}
 * - Events are emitted for every state-changing operation.
 */

const { Contract } = require('fabric-contract-api');
const {
    validateSHA256,
    validateNotEmpty,
    createCompositeKeyForAccess,
    getCurrentTimestamp,
} = require('./utils');

// ── Allowed MSP sets ────────────────────────────────────────────────────────
const ALL_ORGS            = new Set(['Org1MSP', 'Org2MSP', 'Org3MSP']);
const PATIENT_REG_ORGS    = new Set(['Org1MSP', 'Org3MSP']);
const HOSPITAL_REG_ORGS   = new Set(['Org1MSP', 'OrdererMSP']);
const VALID_DOC_STATUSES  = new Set(['ACTIVE', 'REVOKED', 'ARCHIVED']);

// ── State key builders ───────────────────────────────────────────────────────
const KEY = {
    patient:  (id) => `PATIENT::${id}`,
    hospital: (id) => `HOSPITAL::${id}`,
    document: (id) => `DOCUMENT::${id}`,
    review:   (id) => `REVIEW::${id}`,
};

class HealthChainContract extends Contract {

    constructor() {
        super('HealthChainContract');
    }

    // ══════════════════════════════════════════════════════════════════════════
    // Internal helpers
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * Returns the caller's MSP ID and validates it belongs to known orgs
     * (unless `allowedSet` is null, which skips the membership check).
     */
    _getCallerMSP(ctx, allowedSet = null) {
        const mspId = ctx.clientIdentity.getMSPID();
        if (allowedSet && !allowedSet.has(mspId)) {
            throw new Error(
                `Access denied: caller MSP '${mspId}' is not authorised for this operation. ` +
                `Allowed: [${[...allowedSet].join(', ')}]`
            );
        }
        return mspId;
    }

    /** Reads state and returns parsed object, or null if not found. */
    async _getState(ctx, key) {
        const raw = await ctx.stub.getState(key);
        if (!raw || raw.length === 0) return null;
        return JSON.parse(raw.toString('utf8'));
    }

    /** Writes an object as JSON to world state. */
    async _putState(ctx, key, obj) {
        await ctx.stub.putState(key, Buffer.from(JSON.stringify(obj)));
    }

    /** Emits a named Fabric event with a JSON payload. */
    _emitEvent(ctx, name, payload) {
        ctx.stub.setEvent(name, Buffer.from(JSON.stringify(payload)));
    }

    /** Validates a timestamp string represents a parseable number (epoch ms). */
    _validateTimestamp(ts, fieldName) {
        validateNotEmpty(ts, fieldName);
        const n = Number(ts);
        if (isNaN(n) || n <= 0) {
            throw new Error(
                `Validation failed: '${fieldName}' must be a valid epoch millisecond timestamp. Got: '${ts}'`
            );
        }
        return n;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // Patient / Hospital Registration
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * Registers patient metadata on-ledger.
     *
     * @param {string} patientId     Unique patient identifier.
     * @param {string} name          Patient display name.
     * @param {string} dateOfBirth   Must be supplied as a pre-computed hash by the caller.
     *                               The contract stores it verbatim (caller's responsibility).
     * @param {string} contactHash   SHA-256 hash of contact details.
     *
     * Caller restriction: Org1MSP (HospitalA) or Org3MSP (DiagnosticLab).
     *
     * Note: "dateOfBirth" and "contactHash" parameters MUST already be hashed
     * by the client before submission. The chaincode never receives or stores
     * raw PII.
     */
    async RegisterPatient(ctx, patientId, name, dateOfBirth, contactHash) {
        const callerMSP = this._getCallerMSP(ctx, PATIENT_REG_ORGS);

        // Input validation
        validateNotEmpty(patientId,   'patientId');
        validateNotEmpty(name,        'name');
        validateNotEmpty(dateOfBirth, 'dateOfBirth');
        validateNotEmpty(contactHash, 'contactHash');

        if (!validateSHA256(contactHash)) {
            throw new Error(
                `Validation failed: 'contactHash' must be a valid SHA-256 hex string (64 hex chars). Got: '${contactHash}'`
            );
        }

        // Duplicate check
        const existing = await this._getState(ctx, KEY.patient(patientId));
        if (existing) {
            throw new Error(`Patient with ID '${patientId}' is already registered.`);
        }

        const record = {
            patientId,
            name,
            dateOfBirthHash: dateOfBirth,  // stored label makes intent explicit
            contactHash,
            registeredBy:  callerMSP,
            registeredAt:  getCurrentTimestamp(),
            recordType:    'PATIENT',
        };

        await this._putState(ctx, KEY.patient(patientId), record);

        this._emitEvent(ctx, 'PatientRegistered', { patientId, registeredBy: callerMSP });

        return JSON.stringify({ success: true, patientId });
    }

    /**
     * Registers a hospital record on-ledger.
     *
     * @param {string} hospitalId  Unique hospital identifier.
     * @param {string} name        Hospital name.
     * @param {string} orgMSP      The MSP this hospital maps to.
     *
     * Caller restriction: Org1MSP or OrdererMSP.
     */
    async RegisterHospital(ctx, hospitalId, name, orgMSP) {
        const callerMSP = this._getCallerMSP(ctx, HOSPITAL_REG_ORGS);

        // Input validation
        validateNotEmpty(hospitalId, 'hospitalId');
        validateNotEmpty(name,       'name');
        validateNotEmpty(orgMSP,     'orgMSP');

        if (!ALL_ORGS.has(orgMSP) && orgMSP !== 'OrdererMSP') {
            throw new Error(
                `Validation failed: 'orgMSP' must be one of [${[...ALL_ORGS].join(', ')}]. Got: '${orgMSP}'`
            );
        }

        // Duplicate check
        const existing = await this._getState(ctx, KEY.hospital(hospitalId));
        if (existing) {
            throw new Error(`Hospital with ID '${hospitalId}' is already registered.`);
        }

        const record = {
            hospitalId,
            name,
            orgMSP,
            registeredBy: callerMSP,
            registeredAt: getCurrentTimestamp(),
            recordType:   'HOSPITAL',
        };

        await this._putState(ctx, KEY.hospital(hospitalId), record);

        this._emitEvent(ctx, 'HospitalRegistered', { hospitalId, orgMSP, registeredBy: callerMSP });

        return JSON.stringify({ success: true, hospitalId });
    }

    // ══════════════════════════════════════════════════════════════════════════
    // Document Functions
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * Registers a document hash on the ledger.
     *
     * @param {string} documentId          Unique document identifier.
     * @param {string} patientId           Patient this document belongs to.
     * @param {string} documentType        E.g. "LAB_REPORT", "PRESCRIPTION_REF".
     * @param {string} issuerOrg           MSP of the issuing organisation.
     * @param {string} sha256Hash          SHA-256 hex digest of the off-chain document.
     * @param {string} encryptedMetadata   Opaque encrypted blob (stored as-is).
     * @param {string} timestamp           Epoch milliseconds (as string).
     *
     * Caller restriction: caller MSP must equal issuerOrg.
     * Emits: DocumentRegistered
     */
    async RegisterDocument(ctx, documentId, patientId, documentType, issuerOrg, sha256Hash, encryptedMetadata, timestamp) {
        const callerMSP = this._getCallerMSP(ctx, ALL_ORGS);

        // Input validation
        validateNotEmpty(documentId,        'documentId');
        validateNotEmpty(patientId,         'patientId');
        validateNotEmpty(documentType,      'documentType');
        validateNotEmpty(issuerOrg,         'issuerOrg');
        validateNotEmpty(sha256Hash,        'sha256Hash');
        validateNotEmpty(encryptedMetadata, 'encryptedMetadata');
        this._validateTimestamp(timestamp,  'timestamp');

        // Caller must match issuerOrg
        if (callerMSP !== issuerOrg) {
            throw new Error(
                `Access denied: caller MSP '${callerMSP}' does not match issuerOrg '${issuerOrg}'. ` +
                `Only the issuing organisation may register a document.`
            );
        }

        // Validate SHA-256 format
        if (!validateSHA256(sha256Hash)) {
            throw new Error(
                `Validation failed: 'sha256Hash' must be a 64-character hexadecimal string. Got: '${sha256Hash}'`
            );
        }

        // Patient must exist
        const patient = await this._getState(ctx, KEY.patient(patientId));
        if (!patient) {
            throw new Error(`Patient '${patientId}' is not registered. Register the patient before uploading documents.`);
        }

        // Duplicate document check
        const existing = await this._getState(ctx, KEY.document(documentId));
        if (existing) {
            throw new Error(`Document with ID '${documentId}' is already registered.`);
        }

        const record = {
            documentId,
            patientId,
            documentType,
            issuerOrg,
            sha256Hash,
            encryptedMetadata,
            registeredBy: callerMSP,
            timestamp:    String(timestamp),
            status:       'ACTIVE',
            version:      1,
            recordType:   'DOCUMENT',
        };

        await this._putState(ctx, KEY.document(documentId), record);

        this._emitEvent(ctx, 'DocumentRegistered', {
            documentId,
            patientId,
            issuerOrg,
            documentType,
            registeredBy: callerMSP,
            timestamp:    String(timestamp),
        });

        return JSON.stringify({ success: true, documentId, status: 'ACTIVE' });
    }

    /**
     * Verifies a document by comparing the provided hash against the stored one.
     *
     * @param {string} documentId    Document to verify.
     * @param {string} providedHash  SHA-256 hex digest supplied by the verifier.
     *
     * Returns: { documentId, storedHash, providedHash, verified, status, issuerOrg, timestamp }
     */
    async VerifyDocument(ctx, documentId, providedHash) {
        this._getCallerMSP(ctx, ALL_ORGS);

        validateNotEmpty(documentId,  'documentId');
        validateNotEmpty(providedHash,'providedHash');

        if (!validateSHA256(providedHash)) {
            throw new Error(
                `Validation failed: 'providedHash' must be a 64-character hexadecimal string. Got: '${providedHash}'`
            );
        }

        const doc = await this._getState(ctx, KEY.document(documentId));
        if (!doc) {
            throw new Error(`Document '${documentId}' not found on ledger.`);
        }

        const verified = doc.sha256Hash.toLowerCase() === providedHash.toLowerCase();

        return JSON.stringify({
            documentId:   doc.documentId,
            storedHash:   doc.sha256Hash,
            providedHash: providedHash,
            verified:     verified,
            status:       doc.status,
            issuerOrg:    doc.issuerOrg,
            timestamp:    doc.timestamp,
        });
    }

    /**
     * Returns document metadata.
     * If the caller is not the issuer org they must have an active access grant.
     *
     * @param {string} documentId
     */
    async GetDocumentMetadata(ctx, documentId) {
        const callerMSP = this._getCallerMSP(ctx, ALL_ORGS);

        validateNotEmpty(documentId, 'documentId');

        const doc = await this._getState(ctx, KEY.document(documentId));
        if (!doc) {
            throw new Error(`Document '${documentId}' not found on ledger.`);
        }

        // Issuer org has unrestricted access; others must hold a valid grant.
        if (callerMSP !== doc.issuerOrg) {
            const accessKey = createCompositeKeyForAccess(ctx.stub, documentId, callerMSP);
            const accessRecord = await this._getState(ctx, accessKey);

            if (!accessRecord || accessRecord.status !== 'ACTIVE') {
                throw new Error(
                    `Access denied: '${callerMSP}' does not have an active access grant for document '${documentId}'.`
                );
            }

            const now = Date.now();
            if (accessRecord.expiryTimestamp && Number(accessRecord.expiryTimestamp) < now) {
                throw new Error(
                    `Access denied: the access grant for '${callerMSP}' on document '${documentId}' has expired.`
                );
            }
        }

        // Return metadata without the encrypted blob for privacy layering
        const { sha256Hash, issuerOrg, patientId, documentType, timestamp, status, version, registeredBy } = doc;
        return JSON.stringify({ documentId, patientId, documentType, issuerOrg, sha256Hash, timestamp, status, version, registeredBy });
    }

    /**
     * Returns the full ledger history for a document.
     *
     * @param {string} documentId
     */
    async GetDocumentHistory(ctx, documentId) {
        const callerMSP = this._getCallerMSP(ctx, ALL_ORGS);

        validateNotEmpty(documentId, 'documentId');

        // Ensure document exists
        const doc = await this._getState(ctx, KEY.document(documentId));
        if (!doc) {
            throw new Error(`Document '${documentId}' not found on ledger.`);
        }

        // Only issuer org or orgs with an active grant may view history
        if (callerMSP !== doc.issuerOrg) {
            const accessKey = createCompositeKeyForAccess(ctx.stub, documentId, callerMSP);
            const accessRecord = await this._getState(ctx, accessKey);
            if (!accessRecord || accessRecord.status !== 'ACTIVE') {
                throw new Error(
                    `Access denied: '${callerMSP}' does not have an active access grant to view the history of document '${documentId}'.`
                );
            }
        }

        const historyIterator = await ctx.stub.getHistoryForKey(KEY.document(documentId));
        const history = [];

        try {
            while (true) {
                const result = await historyIterator.next();
                if (result.done) break;

                const entry = result.value;
                const historyRecord = {
                    txId:      entry.txId,
                    timestamp: entry.timestamp
                        ? new Date(entry.timestamp.seconds.low * 1000).toISOString()
                        : null,
                    isDelete:  entry.isDelete,
                    value:     entry.isDelete
                        ? null
                        : JSON.parse(entry.value.toString('utf8')),
                };
                history.push(historyRecord);
            }
        } finally {
            await historyIterator.close();
        }

        return JSON.stringify(history);
    }

    /**
     * Updates the status of a document.
     *
     * @param {string} documentId
     * @param {string} newStatus   One of ACTIVE | REVOKED | ARCHIVED.
     *
     * Caller restriction: only the issuer org may update status.
     */
    async UpdateDocumentStatus(ctx, documentId, newStatus) {
        const callerMSP = this._getCallerMSP(ctx, ALL_ORGS);

        validateNotEmpty(documentId, 'documentId');
        validateNotEmpty(newStatus,  'newStatus');

        if (!VALID_DOC_STATUSES.has(newStatus)) {
            throw new Error(
                `Validation failed: 'newStatus' must be one of [${[...VALID_DOC_STATUSES].join(', ')}]. Got: '${newStatus}'`
            );
        }

        const doc = await this._getState(ctx, KEY.document(documentId));
        if (!doc) {
            throw new Error(`Document '${documentId}' not found on ledger.`);
        }

        if (callerMSP !== doc.issuerOrg) {
            throw new Error(
                `Access denied: only the issuer org ('${doc.issuerOrg}') may update document status. Caller: '${callerMSP}'.`
            );
        }

        const previousStatus = doc.status;
        doc.status  = newStatus;
        doc.version = (doc.version || 1) + 1;

        await this._putState(ctx, KEY.document(documentId), doc);

        this._emitEvent(ctx, 'DocumentStatusUpdated', {
            documentId,
            previousStatus,
            newStatus,
            updatedBy: callerMSP,
            updatedAt: getCurrentTimestamp(),
        });

        return JSON.stringify({ success: true, documentId, previousStatus, newStatus });
    }

    // ══════════════════════════════════════════════════════════════════════════
    // Access Management
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * Grants an organisation read-access to a document on behalf of a patient.
     *
     * @param {string} documentId        Target document.
     * @param {string} patientId         Owning patient.
     * @param {string} granteeOrg        MSP being granted access.
     * @param {string} expiryTimestamp   Epoch ms string; 0 or empty = no expiry.
     *
     * Caller restriction: caller MSP must be the patient's registered org.
     * Emits: AccessGranted
     */
    async GrantAccess(ctx, documentId, patientId, granteeOrg, expiryTimestamp) {
        const callerMSP = this._getCallerMSP(ctx, ALL_ORGS);

        validateNotEmpty(documentId, 'documentId');
        validateNotEmpty(patientId,  'patientId');
        validateNotEmpty(granteeOrg, 'granteeOrg');

        if (!ALL_ORGS.has(granteeOrg)) {
            throw new Error(
                `Validation failed: 'granteeOrg' must be one of [${[...ALL_ORGS].join(', ')}]. Got: '${granteeOrg}'`
            );
        }

        // Validate expiry if provided
        let expiryMs = 0;
        if (expiryTimestamp && String(expiryTimestamp).trim() !== '' && String(expiryTimestamp) !== '0') {
            expiryMs = this._validateTimestamp(expiryTimestamp, 'expiryTimestamp');
        }

        // Patient must exist
        const patient = await this._getState(ctx, KEY.patient(patientId));
        if (!patient) {
            throw new Error(`Patient '${patientId}' is not registered.`);
        }

        // Caller must be patient's registered org
        if (callerMSP !== patient.registeredBy) {
            throw new Error(
                `Access denied: only the patient's registered org ('${patient.registeredBy}') may grant access. Caller: '${callerMSP}'.`
            );
        }

        // Document must exist
        const doc = await this._getState(ctx, KEY.document(documentId));
        if (!doc) {
            throw new Error(`Document '${documentId}' not found on ledger.`);
        }

        if (doc.patientId !== patientId) {
            throw new Error(
                `Document '${documentId}' does not belong to patient '${patientId}'.`
            );
        }

        const accessKey = createCompositeKeyForAccess(ctx.stub, documentId, granteeOrg);

        const accessRecord = {
            documentId,
            patientId,
            granteeOrg,
            grantedBy:       callerMSP,
            grantedAt:       getCurrentTimestamp(),
            expiryTimestamp: expiryMs > 0 ? String(expiryMs) : null,
            status:          'ACTIVE',
            recordType:      'ACCESS',
        };

        await this._putState(ctx, accessKey, accessRecord);

        this._emitEvent(ctx, 'AccessGranted', {
            documentId,
            patientId,
            granteeOrg,
            grantedBy: callerMSP,
            expiryTimestamp: accessRecord.expiryTimestamp,
        });

        return JSON.stringify({ success: true, documentId, granteeOrg, status: 'ACTIVE' });
    }

    /**
     * Revokes a previously granted access.
     *
     * @param {string} documentId
     * @param {string} patientId
     * @param {string} granteeOrg
     *
     * Caller restriction: caller MSP must be the patient's registered org.
     * Emits: AccessRevoked
     */
    async RevokeAccess(ctx, documentId, patientId, granteeOrg) {
        const callerMSP = this._getCallerMSP(ctx, ALL_ORGS);

        validateNotEmpty(documentId, 'documentId');
        validateNotEmpty(patientId,  'patientId');
        validateNotEmpty(granteeOrg, 'granteeOrg');

        // Patient must exist
        const patient = await this._getState(ctx, KEY.patient(patientId));
        if (!patient) {
            throw new Error(`Patient '${patientId}' is not registered.`);
        }

        // Caller must be patient's registered org
        if (callerMSP !== patient.registeredBy) {
            throw new Error(
                `Access denied: only the patient's registered org ('${patient.registeredBy}') may revoke access. Caller: '${callerMSP}'.`
            );
        }

        const accessKey = createCompositeKeyForAccess(ctx.stub, documentId, granteeOrg);
        const accessRecord = await this._getState(ctx, accessKey);

        if (!accessRecord) {
            throw new Error(
                `No access grant found for org '${granteeOrg}' on document '${documentId}'.`
            );
        }

        if (accessRecord.status === 'REVOKED') {
            throw new Error(
                `Access for org '${granteeOrg}' on document '${documentId}' is already REVOKED.`
            );
        }

        accessRecord.status     = 'REVOKED';
        accessRecord.revokedBy  = callerMSP;
        accessRecord.revokedAt  = getCurrentTimestamp();

        await this._putState(ctx, accessKey, accessRecord);

        this._emitEvent(ctx, 'AccessRevoked', {
            documentId,
            patientId,
            granteeOrg,
            revokedBy: callerMSP,
        });

        return JSON.stringify({ success: true, documentId, granteeOrg, status: 'REVOKED' });
    }

    /**
     * Checks whether an org currently has active, unexpired access to a document.
     *
     * @param {string} documentId
     * @param {string} requestingOrg
     *
     * Returns: { hasAccess: boolean, reason: string }
     */
    async CheckAccess(ctx, documentId, requestingOrg) {
        this._getCallerMSP(ctx, ALL_ORGS);

        validateNotEmpty(documentId,    'documentId');
        validateNotEmpty(requestingOrg, 'requestingOrg');

        // Document must exist
        const doc = await this._getState(ctx, KEY.document(documentId));
        if (!doc) {
            return JSON.stringify({
                hasAccess: false,
                reason:    `Document '${documentId}' not found on ledger.`,
            });
        }

        // Issuer org always has implicit access
        if (requestingOrg === doc.issuerOrg) {
            return JSON.stringify({
                hasAccess: true,
                reason:    `'${requestingOrg}' is the issuer org and has implicit access.`,
            });
        }

        const accessKey = createCompositeKeyForAccess(ctx.stub, documentId, requestingOrg);
        const accessRecord = await this._getState(ctx, accessKey);

        if (!accessRecord) {
            return JSON.stringify({
                hasAccess: false,
                reason:    `No access grant exists for org '${requestingOrg}' on document '${documentId}'.`,
            });
        }

        if (accessRecord.status !== 'ACTIVE') {
            return JSON.stringify({
                hasAccess: false,
                reason:    `Access grant for org '${requestingOrg}' on document '${documentId}' has status '${accessRecord.status}'.`,
            });
        }

        if (accessRecord.expiryTimestamp && Number(accessRecord.expiryTimestamp) < Date.now()) {
            return JSON.stringify({
                hasAccess: false,
                reason:    `Access grant for org '${requestingOrg}' on document '${documentId}' expired at ${new Date(Number(accessRecord.expiryTimestamp)).toISOString()}.`,
            });
        }

        return JSON.stringify({
            hasAccess: true,
            reason:    `'${requestingOrg}' holds an active access grant for document '${documentId}'.`,
        });
    }

    /**
     * Returns all access records for a given document using a partial composite key scan.
     *
     * @param {string} documentId
     */
    async GetAccessHistory(ctx, documentId) {
        const callerMSP = this._getCallerMSP(ctx, ALL_ORGS);

        validateNotEmpty(documentId, 'documentId');

        // Only issuer org or document owner org can view full access history
        const doc = await this._getState(ctx, KEY.document(documentId));
        if (!doc) {
            throw new Error(`Document '${documentId}' not found on ledger.`);
        }

        if (callerMSP !== doc.issuerOrg) {
            // Check if caller has an active access grant
            const accessKey = createCompositeKeyForAccess(ctx.stub, documentId, callerMSP);
            const accessRecord = await this._getState(ctx, accessKey);
            if (!accessRecord || accessRecord.status !== 'ACTIVE') {
                throw new Error(
                    `Access denied: '${callerMSP}' does not have permission to view the access history of document '${documentId}'.`
                );
            }
        }

        const iterator = await ctx.stub.getStateByPartialCompositeKey(
            'documentId~granteeOrg',
            [documentId]
        );

        const records = [];
        try {
            while (true) {
                const result = await iterator.next();
                if (result.done) break;
                if (result.value && result.value.value && result.value.value.length > 0) {
                    records.push(JSON.parse(result.value.value.toString('utf8')));
                }
            }
        } finally {
            await iterator.close();
        }

        return JSON.stringify(records);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // Doctor Reviews
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * Adds a doctor review reference to a document.
     * Full medical notes are NEVER stored here; only a hash and summary.
     *
     * @param {string} reviewId             Unique review identifier.
     * @param {string} documentId           Document being reviewed.
     * @param {string} doctorId             Identifier of the reviewing doctor.
     * @param {string} doctorOrg            MSP of the doctor's organisation.
     * @param {string} reviewHash           SHA-256 hash of the full off-chain review.
     * @param {string} observationsSummary  Brief non-sensitive summary (no diagnoses/prescriptions).
     * @param {string} digitalSignature     Doctor's digital signature over reviewHash.
     * @param {string} timestamp            Epoch ms string.
     *
     * Caller restriction: caller MSP must equal doctorOrg AND hold an active grant.
     * Emits: ReviewAdded
     */
    async AddDoctorReview(ctx, reviewId, documentId, doctorId, doctorOrg, reviewHash, observationsSummary, digitalSignature, timestamp) {
        const callerMSP = this._getCallerMSP(ctx, ALL_ORGS);

        // Input validation
        validateNotEmpty(reviewId,             'reviewId');
        validateNotEmpty(documentId,           'documentId');
        validateNotEmpty(doctorId,             'doctorId');
        validateNotEmpty(doctorOrg,            'doctorOrg');
        validateNotEmpty(reviewHash,           'reviewHash');
        validateNotEmpty(observationsSummary,  'observationsSummary');
        validateNotEmpty(digitalSignature,     'digitalSignature');
        this._validateTimestamp(timestamp,     'timestamp');

        if (!ALL_ORGS.has(doctorOrg)) {
            throw new Error(
                `Validation failed: 'doctorOrg' must be one of [${[...ALL_ORGS].join(', ')}]. Got: '${doctorOrg}'`
            );
        }

        if (callerMSP !== doctorOrg) {
            throw new Error(
                `Access denied: caller MSP '${callerMSP}' does not match doctorOrg '${doctorOrg}'.`
            );
        }

        if (!validateSHA256(reviewHash)) {
            throw new Error(
                `Validation failed: 'reviewHash' must be a 64-character hexadecimal string. Got: '${reviewHash}'`
            );
        }

        // Document must exist
        const doc = await this._getState(ctx, KEY.document(documentId));
        if (!doc) {
            throw new Error(`Document '${documentId}' not found on ledger.`);
        }

        // Caller must hold an active access grant (unless they are the issuer)
        if (callerMSP !== doc.issuerOrg) {
            const accessKey = createCompositeKeyForAccess(ctx.stub, documentId, callerMSP);
            const accessRecord = await this._getState(ctx, accessKey);

            if (!accessRecord || accessRecord.status !== 'ACTIVE') {
                throw new Error(
                    `Access denied: '${callerMSP}' does not have an active access grant to review document '${documentId}'.`
                );
            }

            if (accessRecord.expiryTimestamp && Number(accessRecord.expiryTimestamp) < Date.now()) {
                throw new Error(
                    `Access denied: the access grant for '${callerMSP}' on document '${documentId}' has expired.`
                );
            }
        }

        // Duplicate review check
        const existing = await this._getState(ctx, KEY.review(reviewId));
        if (existing) {
            throw new Error(`Review with ID '${reviewId}' already exists.`);
        }

        const record = {
            reviewId,
            documentId,
            doctorId,
            doctorOrg,
            reviewHash,
            observationsSummary,
            digitalSignature,
            timestamp:  String(timestamp),
            addedBy:    callerMSP,
            addedAt:    getCurrentTimestamp(),
            recordType: 'REVIEW',
        };

        await this._putState(ctx, KEY.review(reviewId), record);

        this._emitEvent(ctx, 'ReviewAdded', {
            reviewId,
            documentId,
            doctorOrg,
            addedBy: callerMSP,
            timestamp: String(timestamp),
        });

        return JSON.stringify({ success: true, reviewId, documentId });
    }

    /**
     * Returns all reviews associated with a document.
     * Uses a range scan on the REVIEW:: key space filtered by documentId.
     *
     * @param {string} documentId
     */
    async GetDocumentReviews(ctx, documentId) {
        const callerMSP = this._getCallerMSP(ctx, ALL_ORGS);

        validateNotEmpty(documentId, 'documentId');

        const doc = await this._getState(ctx, KEY.document(documentId));
        if (!doc) {
            throw new Error(`Document '${documentId}' not found on ledger.`);
        }

        // Caller must be issuer or hold active grant
        if (callerMSP !== doc.issuerOrg) {
            const accessKey = createCompositeKeyForAccess(ctx.stub, documentId, callerMSP);
            const accessRecord = await this._getState(ctx, accessKey);
            if (!accessRecord || accessRecord.status !== 'ACTIVE') {
                throw new Error(
                    `Access denied: '${callerMSP}' does not have an active access grant to view reviews of document '${documentId}'.`
                );
            }
        }

        // Scan all REVIEW:: keys and filter by documentId
        const iterator = await ctx.stub.getStateByRange('REVIEW::', 'REVIEW::\uFFFF');
        const reviews = [];

        try {
            while (true) {
                const result = await iterator.next();
                if (result.done) break;
                if (result.value && result.value.value && result.value.value.length > 0) {
                    const review = JSON.parse(result.value.value.toString('utf8'));
                    if (review.documentId === documentId) {
                        reviews.push(review);
                    }
                }
            }
        } finally {
            await iterator.close();
        }

        return JSON.stringify(reviews);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // Audit / Explorer
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * Returns all document records for a given patient using a range scan.
     * Scans the full DOCUMENT:: namespace and filters in-chaincode.
     *
     * @param {string} patientId
     */
    async GetAllDocumentsByPatient(ctx, patientId) {
        const callerMSP = this._getCallerMSP(ctx, ALL_ORGS);

        validateNotEmpty(patientId, 'patientId');

        // Patient must exist
        const patient = await this._getState(ctx, KEY.patient(patientId));
        if (!patient) {
            throw new Error(`Patient '${patientId}' is not registered.`);
        }

        // Only the patient's registered org may enumerate all their documents
        if (callerMSP !== patient.registeredBy) {
            throw new Error(
                `Access denied: only the patient's registered org ('${patient.registeredBy}') may list all documents. Caller: '${callerMSP}'.`
            );
        }

        const iterator = await ctx.stub.getStateByRange('DOCUMENT::', 'DOCUMENT::\uFFFF');
        const documents = [];

        try {
            while (true) {
                const result = await iterator.next();
                if (result.done) break;
                if (result.value && result.value.value && result.value.value.length > 0) {
                    const doc = JSON.parse(result.value.value.toString('utf8'));
                    if (doc.patientId === patientId) {
                        // Strip encrypted metadata from list view
                        const { encryptedMetadata, ...meta } = doc;
                        documents.push(meta);
                    }
                }
            }
        } finally {
            await iterator.close();
        }

        return JSON.stringify(documents);
    }

    /**
     * Generic history retrieval for any keyed record (document, patient, review).
     * The caller supplies the full composite key prefix and the record ID.
     *
     * @param {string} recordId   The identifier of the record.
     *
     * Supported prefix auto-detection: if the ID starts with a known prefix it
     * is used directly; otherwise the function tries DOCUMENT:: first.
     */
    async GetTransactionHistory(ctx, recordId) {
        this._getCallerMSP(ctx, ALL_ORGS);

        validateNotEmpty(recordId, 'recordId');

        // Auto-detect key type or default to document
        let stateKey;
        if (recordId.startsWith('PATIENT::') || recordId.startsWith('HOSPITAL::') ||
            recordId.startsWith('DOCUMENT::') || recordId.startsWith('REVIEW::')) {
            stateKey = recordId;
        } else {
            // Try to resolve as document, then patient, then review
            const docExists  = await this._getState(ctx, KEY.document(recordId));
            const patExists  = await this._getState(ctx, KEY.patient(recordId));
            const revExists  = await this._getState(ctx, KEY.review(recordId));

            if      (docExists)  stateKey = KEY.document(recordId);
            else if (patExists)  stateKey = KEY.patient(recordId);
            else if (revExists)  stateKey = KEY.review(recordId);
            else {
                throw new Error(
                    `Record '${recordId}' not found. Provide the full prefixed key (e.g. 'DOCUMENT::${recordId}') or a valid record ID.`
                );
            }
        }

        const historyIterator = await ctx.stub.getHistoryForKey(stateKey);
        const history = [];

        try {
            while (true) {
                const result = await historyIterator.next();
                if (result.done) break;

                const entry = result.value;
                history.push({
                    txId:      entry.txId,
                    timestamp: entry.timestamp
                        ? new Date(entry.timestamp.seconds.low * 1000).toISOString()
                        : null,
                    isDelete:  entry.isDelete,
                    value:     entry.isDelete
                        ? null
                        : JSON.parse(entry.value.toString('utf8')),
                });
            }
        } finally {
            await historyIterator.close();
        }

        return JSON.stringify(history);
    }
}

module.exports = { HealthChainContract };
