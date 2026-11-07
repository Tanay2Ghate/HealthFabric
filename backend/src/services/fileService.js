'use strict';

/**
 * @module services/fileService
 * Handles secure file validation, AES-256-GCM encryption/decryption,
 * SHA-256 hashing, and encrypted file persistence.
 *
 * Key storage: per-document symmetric keys are stored as JSON files in .keys/
 * In production replace with a KMS (AWS KMS, GCP Cloud KMS, HashiCorp Vault).
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;       // 128-bit IV
const AUTH_TAG_LENGTH = 16; // 128-bit authentication tag

const isVercel = Boolean(process.env.VERCEL);
const defaultUploadDir = isVercel ? '/tmp/uploads/encrypted' : 'uploads/encrypted';
const defaultKeysDir = isVercel ? '/tmp/.keys' : '.keys';

const UPLOAD_DIR = path.isAbsolute(process.env.UPLOAD_DIR || '')
  ? process.env.UPLOAD_DIR
  : path.resolve(__dirname, '..', '..', process.env.UPLOAD_DIR || defaultUploadDir);

const KEYS_DIR = path.isAbsolute(process.env.KEYS_DIR || '')
  ? process.env.KEYS_DIR
  : path.resolve(__dirname, '..', '..', process.env.KEYS_DIR || defaultKeysDir);

// Ensure directories exist
[UPLOAD_DIR, KEYS_DIR].forEach(dir => {
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  } catch (dirErr) {
    logger.warn('Could not ensure storage directory', { dir, error: dirErr.message });
  }
});

// If running in Vercel serverless, copy any existing key files from repo to /tmp/.keys
if (isVercel) {
  try {
    const seedKeysDir = path.resolve(__dirname, '..', '..', '.keys');
    if (fs.existsSync(seedKeysDir)) {
      const keyFiles = fs.readdirSync(seedKeysDir);
      for (const kf of keyFiles) {
        const src = path.join(seedKeysDir, kf);
        const dst = path.join(KEYS_DIR, kf);
        if (!fs.existsSync(dst) && fs.statSync(src).isFile()) {
          fs.copyFileSync(src, dst);
        }
      }
    }
  } catch (copyKeysErr) {
    // Ignore non-critical seed key sync
  }
}

// Master key for wrapping per-document keys (hex → 32-byte Buffer)
function getMasterKey() {
  const hex = process.env.ENCRYPTION_MASTER_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error('ENCRYPTION_MASTER_KEY must be 64 hex characters (32 bytes)');
  }
  return Buffer.from(hex, 'hex');
}

// ---------------------------------------------------------------------------
// Magic-byte MIME detection (no external library required)
// ---------------------------------------------------------------------------

const MAGIC_SIGNATURES = [
  { mime: 'application/pdf',  bytes: [0x25, 0x50, 0x44, 0x46] },              // %PDF
  { mime: 'image/jpeg',       bytes: [0xFF, 0xD8, 0xFF] },                    // JPEG
  { mime: 'image/png',        bytes: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A] }, // PNG
];

const ALLOWED_MIMES = new Set(['application/pdf', 'image/jpeg', 'image/png']);

/**
 * Detect MIME type from file buffer using magic bytes.
 * @param {Buffer} buffer
 * @returns {string|null}
 */
function detectMimeType(buffer) {
  for (const sig of MAGIC_SIGNATURES) {
    if (sig.bytes.every((b, i) => buffer[i] === b)) {
      return sig.mime;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// validateFile
// ---------------------------------------------------------------------------

/**
 * Validate an uploaded file by magic bytes, size, and allowed MIME type.
 *
 * @param {{ buffer: Buffer, originalname: string, size: number }} file - Multer file object
 * @returns {{ valid: boolean, mime: string|null, error: string|null }}
 */
function validateFile(file) {
  if (!file || !file.buffer) {
    return { valid: false, mime: null, error: 'No file data provided' };
  }

  const maxBytes = parseInt(process.env.MAX_FILE_SIZE_MB || '50', 10) * 1024 * 1024;
  if (file.size > maxBytes || file.buffer.length > maxBytes) {
    return {
      valid: false,
      mime: null,
      error: `File exceeds maximum size of ${process.env.MAX_FILE_SIZE_MB || 50} MB`,
    };
  }

  const detectedMime = detectMimeType(file.buffer);
  if (!detectedMime) {
    return { valid: false, mime: null, error: 'Unable to determine file type from content' };
  }

  if (!ALLOWED_MIMES.has(detectedMime)) {
    return {
      valid: false,
      mime: detectedMime,
      error: `File type '${detectedMime}' is not allowed. Permitted: PDF, JPEG, PNG`,
    };
  }

  return { valid: true, mime: detectedMime, error: null };
}

// ---------------------------------------------------------------------------
// computeSHA256
// ---------------------------------------------------------------------------

/**
 * Compute SHA-256 hash of a buffer.
 * @param {Buffer} buffer
 * @returns {string} Hex-encoded hash
 */
function computeSHA256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

// ---------------------------------------------------------------------------
// Key storage helpers
// ---------------------------------------------------------------------------

function keyFilePath(documentId) {
  return path.join(KEYS_DIR, `${documentId}.key.json`);
}

function storeDocumentKey(documentId, keyBuffer, iv, authTag) {
  const payload = {
    key: keyBuffer.toString('hex'),
    algorithm: ALGORITHM,
    createdAt: new Date().toISOString(),
  };
  fs.writeFileSync(keyFilePath(documentId), JSON.stringify(payload), { mode: 0o600 });
  logger.debug('Document encryption key stored', { documentId });
}

function retrieveDocumentKey(documentId) {
  const kfp = keyFilePath(documentId);
  if (!fs.existsSync(kfp)) {
    throw new Error(`Encryption key not found for document: ${documentId}`);
  }
  const payload = JSON.parse(fs.readFileSync(kfp, 'utf8'));
  return Buffer.from(payload.key, 'hex');
}

// ---------------------------------------------------------------------------
// encryptFile
// ---------------------------------------------------------------------------

/**
 * Encrypt a file buffer with AES-256-GCM.
 *
 * Layout of encrypted output (all lengths in bytes):
 *   [2 bytes: IV length] [IV_LENGTH bytes: IV] [2 bytes: authTag length] [AUTH_TAG_LENGTH bytes: authTag] [ciphertext]
 *
 * @param {Buffer} inputBuffer - Plaintext file content
 * @param {string} documentId
 * @returns {{ encrypted: Buffer, keyRef: string }}
 */
function encryptFile(inputBuffer, documentId) {
  const key = crypto.randomBytes(32); // 256-bit key
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  const ciphertext = Buffer.concat([cipher.update(inputBuffer), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Persist the key
  storeDocumentKey(documentId, key);

  // Build encrypted blob: ivLen(2) | iv | tagLen(2) | tag | ciphertext
  const ivLenBuf = Buffer.alloc(2);
  ivLenBuf.writeUInt16BE(IV_LENGTH);
  const tagLenBuf = Buffer.alloc(2);
  tagLenBuf.writeUInt16BE(AUTH_TAG_LENGTH);

  const encrypted = Buffer.concat([ivLenBuf, iv, tagLenBuf, authTag, ciphertext]);
  const keyRef = `${documentId}.key.json`;

  logger.info('File encrypted', { documentId, ciphertextSize: ciphertext.length });
  return { encrypted, keyRef };
}

// ---------------------------------------------------------------------------
// decryptFile
// ---------------------------------------------------------------------------

/**
 * Decrypt an encrypted file blob for a given documentId.
 *
 * @param {string} encryptedPath - Absolute path to the .enc file
 * @param {string} documentId
 * @returns {Buffer} Plaintext file content
 */
function decryptFile(encryptedPath, documentId) {
  if (!fs.existsSync(encryptedPath)) {
    throw new Error(`Encrypted file not found: ${encryptedPath}`);
  }

  const blob = fs.readFileSync(encryptedPath);
  let offset = 0;

  const ivLen = blob.readUInt16BE(offset); offset += 2;
  const iv = blob.slice(offset, offset + ivLen); offset += ivLen;

  const tagLen = blob.readUInt16BE(offset); offset += 2;
  const authTag = blob.slice(offset, offset + tagLen); offset += tagLen;

  const ciphertext = blob.slice(offset);

  const key = retrieveDocumentKey(documentId);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);

  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  logger.info('File decrypted', { documentId });
  return plaintext;
}

// ---------------------------------------------------------------------------
// saveEncryptedFile
// ---------------------------------------------------------------------------

/**
 * Persist an encrypted buffer to uploads/encrypted/{documentId}.enc
 *
 * @param {Buffer} encryptedBuffer
 * @param {string} documentId
 * @returns {string} Absolute path where the file was saved
 */
function saveEncryptedFile(encryptedBuffer, documentId) {
  const filePath = path.join(UPLOAD_DIR, `${documentId}.enc`);
  fs.writeFileSync(filePath, encryptedBuffer);
  logger.info('Encrypted file saved', { documentId, path: filePath });
  return filePath;
}

// ---------------------------------------------------------------------------
// deleteEncryptedFile
// ---------------------------------------------------------------------------

/**
 * Securely delete an encrypted file and its associated key file.
 * Overwrites the content with random bytes before unlinking.
 *
 * @param {string} documentId
 */
function deleteEncryptedFile(documentId) {
  const encPath = path.join(UPLOAD_DIR, `${documentId}.enc`);
  const kfp = keyFilePath(documentId);

  for (const filePath of [encPath, kfp]) {
    if (fs.existsSync(filePath)) {
      try {
        const { size } = fs.statSync(filePath);
        const fd = fs.openSync(filePath, 'r+');
        const random = crypto.randomBytes(size);
        fs.writeSync(fd, random, 0, size, 0);
        fs.closeSync(fd);
        fs.unlinkSync(filePath);
        logger.info('Encrypted file securely deleted', { filePath });
      } catch (err) {
        logger.error('Failed to delete encrypted file', { filePath, error: err.message });
        throw err;
      }
    }
  }
}

module.exports = {
  validateFile,
  computeSHA256,
  encryptFile,
  decryptFile,
  saveEncryptedFile,
  deleteEncryptedFile,
};
