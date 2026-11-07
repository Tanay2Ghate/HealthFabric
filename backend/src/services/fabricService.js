'use strict';

/**
 * @module services/fabricService
 * Thin service layer over the Hyperledger Fabric Gateway.
 *
 * Every exported function:
 *  1. Calls connectToFabric()
 *  2. If mock mode, returns a structured mock response with _mockMode: true
 *  3. Otherwise submits / evaluates a real Fabric transaction
 *  4. Closes the gateway after each call (stateless design for simplicity)
 *  5. Logs and re-throws errors
 */

const { connectToFabric } = require('../config/fabric');
const logger = require('../utils/logger');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse a Uint8Array / Buffer result from Fabric into a JS object.
 * Returns null if the result is empty.
 */
function parseResult(raw) {
  if (!raw || raw.length === 0) return null;
  try {
    return JSON.parse(Buffer.from(raw).toString('utf8'));
  } catch {
    return Buffer.from(raw).toString('utf8');
  }
}

/**
 * Obtain a connected contract, run an async operation, then close the gateway.
 */
async function withContract(operation) {
  const { gateway, contract, _mockMode } = await connectToFabric();
  try {
    return await operation(contract, _mockMode);
  } finally {
    if (gateway && typeof gateway.close === 'function') {
      gateway.close();
    }
  }
}

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function mockTxId() {
  return `MOCK-TX-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

// ---------------------------------------------------------------------------
// registerDocumentOnFabric
// ---------------------------------------------------------------------------

/**
 * Submit a RegisterDocument transaction to the chaincode.
 *
 * @param {{ documentId, patientId, documentType, issuerOrg, issuerUserId, sha256Hash, timestamp }} documentData
 * @returns {Promise<{ txId: string, _mockMode: boolean }>}
 */
async function registerDocumentOnFabric(documentData) {
  return withContract(async (contract, isMock) => {
    if (isMock) {
      logger.info('[MOCK] registerDocumentOnFabric', { documentId: documentData.documentId });
      return { txId: mockTxId(), _mockMode: true };
    }

    const result = await contract.submitTransaction(
      'RegisterDocument',
      documentData.documentId,
      documentData.patientId,
      documentData.documentType,
      documentData.issuerOrg,
      documentData.issuerUserId,
      documentData.sha256Hash,
      documentData.timestamp || new Date().toISOString()
    );

    const parsed = parseResult(result);
    logger.info('RegisterDocument submitted', { documentId: documentData.documentId, result: parsed });
    return { txId: parsed?.txId || 'unknown', result: parsed, _mockMode: false };
  });
}

// ---------------------------------------------------------------------------
// verifyDocumentOnFabric
// ---------------------------------------------------------------------------

/**
 * Evaluate VerifyDocument – checks that the given hash matches what is on-chain.
 *
 * @param {string} documentId
 * @param {string} hash - SHA-256 hex of the original file
 * @returns {Promise<{ verified: boolean, onChainHash: string|null, _mockMode: boolean }>}
 */
async function verifyDocumentOnFabric(documentId, hash) {
  return withContract(async (contract, isMock) => {
    if (isMock) {
      logger.info('[MOCK] verifyDocumentOnFabric', { documentId });
      return { verified: true, onChainHash: hash, _mockMode: true };
    }

    const result = await contract.evaluateTransaction('VerifyDocument', documentId, hash);
    const parsed = parseResult(result);
    logger.info('VerifyDocument evaluated', { documentId, parsed });
    return {
      verified: parsed?.verified ?? false,
      onChainHash: parsed?.hash ?? null,
      _mockMode: false,
    };
  });
}

// ---------------------------------------------------------------------------
// grantAccessOnFabric
// ---------------------------------------------------------------------------

/**
 * Submit a GrantAccess transaction.
 *
 * @param {string} documentId
 * @param {string} patientId
 * @param {string} granteeOrg
 * @param {string|null} expiry - ISO 8601 datetime or null for no expiry
 * @returns {Promise<{ txId: string, _mockMode: boolean }>}
 */
async function grantAccessOnFabric(documentId, patientId, granteeOrg, expiry) {
  return withContract(async (contract, isMock) => {
    if (isMock) {
      logger.info('[MOCK] grantAccessOnFabric', { documentId, granteeOrg });
      return { txId: mockTxId(), _mockMode: true };
    }

    const result = await contract.submitTransaction(
      'GrantAccess',
      documentId,
      patientId,
      granteeOrg,
      expiry || ''
    );
    const parsed = parseResult(result);
    logger.info('GrantAccess submitted', { documentId, granteeOrg });
    return { txId: parsed?.txId || 'unknown', result: parsed, _mockMode: false };
  });
}

// ---------------------------------------------------------------------------
// revokeAccessOnFabric
// ---------------------------------------------------------------------------

/**
 * Submit a RevokeAccess transaction.
 *
 * @param {string} documentId
 * @param {string} patientId
 * @param {string} granteeOrg
 * @returns {Promise<{ txId: string, _mockMode: boolean }>}
 */
async function revokeAccessOnFabric(documentId, patientId, granteeOrg) {
  return withContract(async (contract, isMock) => {
    if (isMock) {
      logger.info('[MOCK] revokeAccessOnFabric', { documentId, granteeOrg });
      return { txId: mockTxId(), _mockMode: true };
    }

    const result = await contract.submitTransaction(
      'RevokeAccess',
      documentId,
      patientId,
      granteeOrg
    );
    const parsed = parseResult(result);
    logger.info('RevokeAccess submitted', { documentId, granteeOrg });
    return { txId: parsed?.txId || 'unknown', result: parsed, _mockMode: false };
  });
}

// ---------------------------------------------------------------------------
// checkAccessOnFabric
// ---------------------------------------------------------------------------

/**
 * Evaluate CheckAccess – returns whether requestingOrg currently has access.
 *
 * @param {string} documentId
 * @param {string} requestingOrg
 * @returns {Promise<{ hasAccess: boolean, _mockMode: boolean }>}
 */
async function checkAccessOnFabric(documentId, requestingOrg) {
  return withContract(async (contract, isMock) => {
    if (isMock) {
      logger.info('[MOCK] checkAccessOnFabric', { documentId, requestingOrg });
      return { hasAccess: true, _mockMode: true };
    }

    const result = await contract.evaluateTransaction('CheckAccess', documentId, requestingOrg);
    const parsed = parseResult(result);
    logger.info('CheckAccess evaluated', { documentId, requestingOrg, parsed });
    return { hasAccess: parsed?.hasAccess ?? false, _mockMode: false };
  });
}

// ---------------------------------------------------------------------------
// addReviewOnFabric
// ---------------------------------------------------------------------------

/**
 * Submit an AddDoctorReview transaction.
 *
 * @param {{ reviewId, documentId, doctorId, doctorOrg, reviewHash, timestamp }} reviewData
 * @returns {Promise<{ txId: string, _mockMode: boolean }>}
 */
async function addReviewOnFabric(reviewData) {
  return withContract(async (contract, isMock) => {
    if (isMock) {
      logger.info('[MOCK] addReviewOnFabric', { reviewId: reviewData.reviewId });
      return { txId: mockTxId(), _mockMode: true };
    }

    const result = await contract.submitTransaction(
      'AddDoctorReview',
      reviewData.reviewId,
      reviewData.documentId,
      reviewData.doctorId,
      reviewData.doctorOrg,
      reviewData.reviewHash,
      reviewData.timestamp || new Date().toISOString()
    );
    const parsed = parseResult(result);
    logger.info('AddDoctorReview submitted', { reviewId: reviewData.reviewId });
    return { txId: parsed?.txId || 'unknown', result: parsed, _mockMode: false };
  });
}

// ---------------------------------------------------------------------------
// getDocumentHistoryFromFabric
// ---------------------------------------------------------------------------

/**
 * Evaluate GetDocumentHistory – returns the full ledger history for a document.
 *
 * @param {string} documentId
 * @returns {Promise<{ history: Array, _mockMode: boolean }>}
 */
async function getDocumentHistoryFromFabric(documentId) {
  return withContract(async (contract, isMock) => {
    if (isMock) {
      logger.info('[MOCK] getDocumentHistoryFromFabric', { documentId });
      return {
        history: [
          {
            txId: mockTxId(),
            timestamp: new Date().toISOString(),
            isDelete: false,
            value: { documentId, status: 'ACTIVE', _mockMode: true },
          },
        ],
        _mockMode: true,
      };
    }

    const result = await contract.evaluateTransaction('GetDocumentHistory', documentId);
    const parsed = parseResult(result);
    logger.info('GetDocumentHistory evaluated', { documentId });
    return { history: Array.isArray(parsed) ? parsed : [parsed], _mockMode: false };
  });
}

// ---------------------------------------------------------------------------
// getAccessHistoryFromFabric
// ---------------------------------------------------------------------------

/**
 * Evaluate GetAccessHistory – returns grant/revoke history for a document.
 *
 * @param {string} documentId
 * @returns {Promise<{ history: Array, _mockMode: boolean }>}
 */
async function getAccessHistoryFromFabric(documentId) {
  return withContract(async (contract, isMock) => {
    if (isMock) {
      logger.info('[MOCK] getAccessHistoryFromFabric', { documentId });
      return {
        history: [
          {
            txId: mockTxId(),
            timestamp: new Date().toISOString(),
            action: 'GRANT',
            documentId,
            _mockMode: true,
          },
        ],
        _mockMode: true,
      };
    }

    const result = await contract.evaluateTransaction('GetAccessHistory', documentId);
    const parsed = parseResult(result);
    logger.info('GetAccessHistory evaluated', { documentId });
    return { history: Array.isArray(parsed) ? parsed : [parsed], _mockMode: false };
  });
}

module.exports = {
  registerDocumentOnFabric,
  verifyDocumentOnFabric,
  grantAccessOnFabric,
  revokeAccessOnFabric,
  checkAccessOnFabric,
  addReviewOnFabric,
  getDocumentHistoryFromFabric,
  getAccessHistoryFromFabric,
};
