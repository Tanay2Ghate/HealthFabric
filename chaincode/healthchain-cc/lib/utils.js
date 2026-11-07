'use strict';

/**
 * HealthChain Utility Helpers
 *
 * Provides reusable validation and key-generation functions
 * used throughout the HealthChainContract.
 */

const SHA256_REGEX = /^[a-fA-F0-9]{64}$/;
const ACCESS_INDEX_NAME = 'documentId~granteeOrg';

/**
 * Validates that a string is a valid SHA-256 hex digest (64 hex chars).
 * @param {string} hash
 * @returns {boolean}
 */
function validateSHA256(hash) {
    if (typeof hash !== 'string') return false;
    return SHA256_REGEX.test(hash);
}

/**
 * Throws a descriptive error if `value` is falsy or only whitespace.
 * @param {string|any} value
 * @param {string} fieldName  Human-readable field label used in error message.
 */
function validateNotEmpty(value, fieldName) {
    if (value === undefined || value === null || String(value).trim() === '') {
        throw new Error(`Validation failed: '${fieldName}' must not be empty.`);
    }
}

/**
 * Creates a deterministic composite key for access-grant records.
 * Index name: 'documentId~granteeOrg'
 * @param {Object} stub  Fabric ChaincodeStub
 * @param {string} documentId
 * @param {string} org
 * @returns {string}
 */
function createCompositeKeyForAccess(stub, documentId, org) {
    return stub.createCompositeKey(ACCESS_INDEX_NAME, [documentId, org]);
}

/**
 * Returns the current wall-clock time as an ISO 8601 string.
 * Note: for deterministic ordering rely on the caller-supplied timestamp;
 * this helper is provided for convenience in event payloads.
 * @returns {string}
 */
function getCurrentTimestamp() {
    return new Date().toISOString();
}

module.exports = {
    validateSHA256,
    validateNotEmpty,
    createCompositeKeyForAccess,
    getCurrentTimestamp,
    ACCESS_INDEX_NAME,
};
