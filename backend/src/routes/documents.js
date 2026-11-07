'use strict';

/**
 * @module routes/documents
 * Medical document management routes:
 *   POST /api/documents/upload                    – upload & register document
 *   GET  /api/documents                           – list accessible documents
 *   GET  /api/documents/:documentId               – get document metadata
 *   GET  /api/documents/:documentId/download      – download & decrypt document
 *   GET  /api/documents/:documentId/verify        – verify hash against Fabric
 *   GET  /api/documents/:documentId/history       – get Fabric ledger history
 */

const express = require('express');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const { param, query: qQuery, validationResult } = require('express-validator');

const { query } = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const fileService = require('../services/fileService');
const fabricService = require('../services/fabricService');
const logger = require('../utils/logger');

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// ---------------------------------------------------------------------------
// Multer – in-memory storage (file never touches disk unencrypted)
// ---------------------------------------------------------------------------

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE_MB || '50', 10) * 1024 * 1024,
  },
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_DOC_TYPES = [
  'CBC', 'BLOOD_TEST', 'MRI', 'CT', 'XRAY', 'PRESCRIPTION',
  'LAB_REPORT', 'RADIOLOGY', 'DISCHARGE', 'VACCINATION', 'OTHER'
];

async function logAudit(eventType, actorId, actorOrg, targetId, targetType, fabricTxId, success, error, req) {
  try {
    await query(
      `INSERT INTO audit_logs
         (event_type, actor_user_id, actor_org, target_id, target_type, fabric_tx_id, event_timestamp, ip_address, user_agent, success, error_message)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'), ?, ?, ?, ?)`,
      [eventType, actorId, actorOrg, targetId, targetType, fabricTxId || null,
       req.ip, req.get('User-Agent') || '', success, error || null]
    );
  } catch (err) {
    logger.error('Audit log write failed', { error: err.message });
  }
}

// Determine whether the requesting user may see a document
async function canUserAccessDocument(doc, reqUser) {
  if (reqUser.role === 'admin') return true;
  if (doc.patient_id === reqUser.userId) return true;
  // The issuing organization always has access to documents it issued
  if (doc.issuer_org === reqUser.organization) return true;

  if (['doctor', 'hospital_admin', 'lab_staff'].includes(reqUser.role)) {
    // Check active permission
    const perms = await query(
      `SELECT id FROM access_permissions
        WHERE document_id = ? AND status = 'ACTIVE'
          AND (grantee_user_id = ? OR grantee_org = ?)
          AND (expiry_at IS NULL OR expiry_at > datetime('now'))
        LIMIT 1`,
      [doc.document_id, reqUser.userId, reqUser.organization]
    );
    return perms.length > 0;
  }

  return false;
}

// ---------------------------------------------------------------------------
// POST /api/documents/upload
// ---------------------------------------------------------------------------

router.post(
  '/upload',
  authorize('patient', 'lab_staff', 'hospital_admin', 'admin'),
  upload.single('file'),
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    const document_type = (req.body.document_type || req.body.documentType || 'OTHER').toUpperCase();
    const patient_id = req.body.patient_id || req.body.patientId;

    if (!document_type || !VALID_DOC_TYPES.includes(document_type)) {
      return res.status(400).json({
        success: false,
        error: `document_type must be one of: ${VALID_DOC_TYPES.join(', ')}`,
      });
    }

    // Patients can only upload for themselves
    const resolvedPatientId = req.user.role === 'patient' ? req.user.userId : patient_id;
    if (!resolvedPatientId) {
      return res.status(400).json({ success: false, error: 'patient_id is required' });
    }

    // Validate target patient exists
    const patientRows = await query(
      "SELECT user_id FROM users WHERE user_id = ? AND role = 'patient' AND is_active = TRUE LIMIT 1",
      [resolvedPatientId]
    );
    if (!patientRows.length) {
      return res.status(404).json({ success: false, error: 'Patient not found' });
    }

    // Validate file by magic bytes
    const validation = fileService.validateFile(req.file);
    if (!validation.valid) {
      return res.status(422).json({ success: false, error: validation.error });
    }

    const documentId = `DOC-${uuidv4()}`;

    try {
      // 1. Hash plaintext
      const sha256Hash = fileService.computeSHA256(req.file.buffer);

      // 2. Encrypt
      const { encrypted, keyRef } = fileService.encryptFile(req.file.buffer, documentId);

      // 3. Persist encrypted file
      const encryptedFilePath = fileService.saveEncryptedFile(encrypted, documentId);

      // 4. Register on Fabric
      const fabricResult = await fabricService.registerDocumentOnFabric({
        documentId,
        patientId: resolvedPatientId,
        documentType: document_type,
        issuerOrg: req.user.organization,
        issuerUserId: req.user.userId,
        sha256Hash,
        timestamp: new Date().toISOString(),
      });

      // 5. Store metadata in DB (single transaction)
      await query(
        `INSERT INTO documents
           (document_id, patient_id, document_type, issuer_org, issuer_user_id,
            sha256_hash, encrypted_file_path, encryption_key_ref, original_filename,
            file_size_bytes, mime_type, fabric_tx_id, fabric_registered, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE')`,
        [
          documentId, resolvedPatientId, document_type,
          req.user.organization, req.user.userId,
          sha256Hash, encryptedFilePath, keyRef,
          req.file.originalname, req.file.size,
          validation.mime,
          fabricResult.txId || null,
          !fabricResult._mockMode,
        ]
      );

      // 6. Store key reference
      await query(
        'INSERT INTO encryption_key_refs (key_ref, document_id) VALUES (?, ?)',
        [keyRef, documentId]
      );

      await logAudit('DOCUMENT_UPLOAD', req.user.userId, req.user.organization, documentId, 'document', fabricResult.txId, true, null, req);

      logger.info('Document uploaded', { documentId, patientId: resolvedPatientId });
      return res.status(201).json({
        success: true,
        message: 'Document uploaded and registered successfully',
        data: {
          documentId,
          sha256Hash,
          fabricTxId: fabricResult.txId,
          _mockMode: fabricResult._mockMode,
        },
      });
    } catch (err) {
      // Attempt to clean up any partially saved files
      try { fileService.deleteEncryptedFile(documentId); } catch (_) {}
      logger.error('Document upload failed', { error: err.message, documentId });
      await logAudit('DOCUMENT_UPLOAD', req.user.userId, req.user.organization, documentId, 'document', null, false, err.message, req);
      return res.status(500).json({ success: false, error: 'Document upload failed' });
    }
  }
);

// ---------------------------------------------------------------------------
// GET /api/documents
// ---------------------------------------------------------------------------

router.get('/', async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page || '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '20', 10)));
  const offset = (page - 1) * limit;
  const statusFilter = req.query.status || 'ACTIVE';

  try {
    let rows;

    if (req.user.role === 'patient') {
      rows = await query(
        `SELECT d.document_id, d.patient_id, d.document_type, d.issuer_org, d.issuer_user_id,
                d.sha256_hash, d.original_filename, d.file_size_bytes, d.mime_type,
                d.fabric_tx_id, d.fabric_registered, d.status, d.version, d.uploaded_at
           FROM documents d
          WHERE d.patient_id = ? AND d.status = ?
          ORDER BY d.uploaded_at DESC
          LIMIT ? OFFSET ?`,
        [req.user.userId, statusFilter, limit, offset]
      );
    } else if (req.user.role === 'admin') {
      rows = await query(
        `SELECT d.document_id, d.patient_id, d.document_type, d.issuer_org, d.issuer_user_id,
                d.sha256_hash, d.original_filename, d.file_size_bytes, d.mime_type,
                d.fabric_tx_id, d.fabric_registered, d.status, d.version, d.uploaded_at
           FROM documents d
          WHERE d.status = ?
          ORDER BY d.uploaded_at DESC
          LIMIT ? OFFSET ?`,
        [statusFilter, limit, offset]
      );
    } else {
      // Doctors / hospital_admin / lab_staff – return documents issued by user's org OR granted to user/org
      rows = await query(
        `SELECT DISTINCT d.document_id, d.patient_id, d.document_type, d.issuer_org, d.issuer_user_id,
                d.sha256_hash, d.original_filename, d.file_size_bytes, d.mime_type,
                d.fabric_tx_id, d.fabric_registered, d.status, d.version, d.uploaded_at
           FROM documents d
           LEFT JOIN access_permissions ap ON ap.document_id = d.document_id
          WHERE (
                  d.issuer_org = ?
                  OR (
                    (ap.grantee_user_id = ? OR ap.grantee_org = ?)
                    AND ap.status = 'ACTIVE'
                    AND (ap.expiry_at IS NULL OR ap.expiry_at > datetime('now'))
                  )
                )
            AND d.status = ?
          ORDER BY d.uploaded_at DESC
          LIMIT ? OFFSET ?`,
        [req.user.organization, req.user.userId, req.user.organization, statusFilter, limit, offset]
      );
    }

    return res.status(200).json({
      success: true,
      data: rows,
      pagination: { page, limit, count: rows.length },
    });
  } catch (err) {
    logger.error('List documents error', { error: err.message });
    return res.status(500).json({ success: false, error: 'Failed to retrieve documents' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/documents/:documentId
// ---------------------------------------------------------------------------

router.get('/:documentId', [param('documentId').notEmpty()], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ success: false, errors: errors.array() });

  try {
    const rows = await query(
      `SELECT document_id, patient_id, document_type, issuer_org, issuer_user_id,
              sha256_hash, original_filename, file_size_bytes, mime_type,
              fabric_tx_id, fabric_registered, status, version, uploaded_at
         FROM documents WHERE document_id = ? LIMIT 1`,
      [req.params.documentId]
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, error: 'Document not found' });
    }

    const doc = rows[0];
    const canAccess = await canUserAccessDocument(doc, req.user);
    if (!canAccess) {
      return res.status(403).json({ success: false, error: 'Access denied to this document' });
    }

    return res.status(200).json({ success: true, data: doc });
  } catch (err) {
    logger.error('Get document error', { error: err.message });
    return res.status(500).json({ success: false, error: 'Failed to retrieve document' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/documents/:documentId/download
// ---------------------------------------------------------------------------

router.get('/:documentId/download', async (req, res) => {
  try {
    const rows = await query(
      'SELECT * FROM documents WHERE document_id = ? LIMIT 1',
      [req.params.documentId]
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, error: 'Document not found' });
    }

    const doc = rows[0];
    const canAccess = await canUserAccessDocument(doc, req.user);
    if (!canAccess) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    if (doc.status !== 'ACTIVE') {
      return res.status(410).json({ success: false, error: `Document is ${doc.status}` });
    }

    const plaintext = fileService.decryptFile(doc.encrypted_file_path, doc.document_id);

    await logAudit('DOCUMENT_DOWNLOAD', req.user.userId, req.user.organization, doc.document_id, 'document', null, true, null, req);

    res.set({
      'Content-Type': doc.mime_type,
      'Content-Disposition': `attachment; filename="${doc.original_filename}"`,
      'Content-Length': plaintext.length,
      'X-Document-Id': doc.document_id,
      'X-SHA256': doc.sha256_hash,
    });

    return res.send(plaintext);
  } catch (err) {
    logger.error('Document download error', { error: err.message, documentId: req.params.documentId });
    await logAudit('DOCUMENT_DOWNLOAD', req.user.userId, req.user.organization, req.params.documentId, 'document', null, false, err.message, req);
    return res.status(500).json({ success: false, error: 'Download failed' });
  }
});

// GET & POST /api/documents/:documentId/verify
router.all('/:documentId/verify', async (req, res) => {
  try {
    const rows = await query(
      'SELECT * FROM documents WHERE document_id = ? LIMIT 1',
      [req.params.documentId]
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, error: 'Document not found' });
    }

    const doc = rows[0];
    const canAccess = await canUserAccessDocument(doc, req.user);
    if (!canAccess) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const fabricResult = await fabricService.verifyDocumentOnFabric(doc.document_id, doc.sha256_hash);

    await logAudit('DOCUMENT_VERIFY', req.user.userId, req.user.organization, doc.document_id, 'document', null, true, null, req);

    return res.status(200).json({
      success: true,
      data: {
        documentId: doc.document_id,
        dbHash: doc.sha256_hash,
        onChainHash: fabricResult.onChainHash,
        verified: fabricResult.verified,
        _mockMode: fabricResult._mockMode,
      },
    });
  } catch (err) {
    logger.error('Document verify error', { error: err.message });
    return res.status(500).json({ success: false, error: 'Verification failed' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/documents/:documentId/history
// ---------------------------------------------------------------------------

router.get('/:documentId/history', async (req, res) => {
  try {
    const rows = await query(
      'SELECT * FROM documents WHERE document_id = ? LIMIT 1',
      [req.params.documentId]
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, error: 'Document not found' });
    }

    const doc = rows[0];
    const canAccess = await canUserAccessDocument(doc, req.user);
    if (!canAccess) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const { history, _mockMode } = await fabricService.getDocumentHistoryFromFabric(doc.document_id);

    return res.status(200).json({ success: true, data: { history, _mockMode } });
  } catch (err) {
    logger.error('Document history error', { error: err.message });
    return res.status(500).json({ success: false, error: 'Failed to retrieve history' });
  }
});

module.exports = router;
