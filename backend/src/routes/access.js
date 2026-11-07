'use strict';

/**
 * @module routes/access
 * Access management routes:
 *   POST /api/access/grant                  – Grant access to an organization
 *   POST /api/access/revoke                 – Revoke access from an organization
 *   GET  /api/access/my-permissions         – List permissions for current patient
 *   GET  /api/access/document/:documentId   – Get permissions for a document
 *   GET  /api/access/check/:documentId      – Verify access status on Fabric
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { body, param, validationResult } = require('express-validator');

const { query } = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const fabricService = require('../services/fabricService');
const logger = require('../utils/logger');

const router = express.Router();

router.use(authenticate);

async function logAudit(eventType, actorId, actorOrg, targetId, targetType, fabricTxId, success, error, req) {
  try {
    await query(
      `INSERT INTO audit_logs
         (event_type, actor_user_id, actor_org, target_id, target_type, fabric_tx_id, success, error_message, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        eventType,
        actorId,
        actorOrg,
        targetId,
        targetType,
        fabricTxId || null,
        success ? 1 : 0,
        error || null,
        req?.ip || null,
        req?.headers?.['user-agent'] || null
      ]
    );
  } catch (err) {
    logger.error('Failed to write audit log', { error: err.message });
  }
}

function normalizeOrg(raw) {
  if (!raw) return null;
  const lower = raw.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (lower.includes('hospitala') || lower.includes('city') || lower.includes('orga')) return 'hospitala';
  if (lower.includes('hospitalb') || lower.includes('metro') || lower.includes('orgb')) return 'hospitalb';
  if (lower.includes('lab') || lower.includes('diag') || lower.includes('org3')) return 'diaglab';
  return raw.toLowerCase();
}

// ---------------------------------------------------------------------------
// POST /api/access/grant
// ---------------------------------------------------------------------------
router.post(
  '/grant',
  async (req, res) => {
    const rawOrg = req.body.granteeOrg || req.body.organization || req.body.grantee;
    const granteeOrg = normalizeOrg(rawOrg);
    const documentId = req.body.documentId;
    const expiresAt = req.body.expiresAt;
    const expiryDays = req.body.expiryDays;

    if (!documentId) {
      return res.status(422).json({ success: false, error: 'documentId is required' });
    }
    if (!['hospitala', 'hospitalb', 'diaglab'].includes(granteeOrg)) {
      return res.status(422).json({ success: false, error: 'Valid organization required (hospitala, hospitalb, diaglab)' });
    }

    const actorId = req.user.userId;
    const actorOrg = req.user.organization;

    try {
      // 1. Verify document exists
      const docs = await query('SELECT * FROM documents WHERE document_id = ?', [documentId]);
      if (!docs.length) {
        return res.status(404).json({ success: false, error: 'Document not found' });
      }

      const doc = docs[0];

      // 2. Authorization: only patient owner or hospital admin of patient's org can grant access
      if (req.user.role === 'patient' && doc.patient_id !== actorId) {
        return res.status(403).json({ success: false, error: 'Cannot grant access to another patient\'s document' });
      }
      if (req.user.role !== 'patient' && req.user.role !== 'hospital_admin' && req.user.role !== 'admin') {
        return res.status(403).json({ success: false, error: 'Unauthorized to grant access' });
      }

      // 3. Compute expiry timestamp
      let expiryTimestamp = null;
      let expiryAtDate = null;
      if (expiresAt) {
        const d = new Date(expiresAt);
        expiryTimestamp = Math.floor(d.getTime() / 1000);
        expiryAtDate = d.toISOString();
      } else if (expiryDays) {
        const d = new Date();
        d.setDate(d.getDate() + parseInt(expiryDays, 10));
        expiryTimestamp = Math.floor(d.getTime() / 1000);
        expiryAtDate = d.toISOString();
      }

      // 4. Submit to Fabric blockchain
      const granteeMSP = granteeOrg === 'hospitala' ? 'Org1MSP' : (granteeOrg === 'hospitalb' ? 'Org2MSP' : 'Org3MSP');
      let fabricResult;
      try {
        fabricResult = await fabricService.grantAccessOnFabric(
          documentId,
          doc.patient_id,
          granteeMSP,
          expiryTimestamp ? String(expiryTimestamp) : '0'
        );
      } catch (fErr) {
        logger.error('Fabric grantAccess failed', { error: fErr.message });
        await logAudit('ACCESS_GRANT_FAILED', actorId, actorOrg, documentId, 'document', null, false, fErr.message, req);
        return res.status(502).json({ success: false, error: 'Blockchain error: ' + fErr.message });
      }

      const fabricTxId = fabricResult.txId;
      const permissionId = `PERM-${uuidv4()}`;

      // 5. Update or insert local access_permissions record
      await query(
        `INSERT INTO access_permissions
           (permission_id, document_id, patient_id, grantee_org, status, expiry_at, fabric_grant_tx_id)
         VALUES (?, ?, ?, ?, 'ACTIVE', ?, ?)`,
        [permissionId, documentId, doc.patient_id, granteeOrg, expiryAtDate, fabricTxId]
      );

      await logAudit('ACCESS_GRANTED', actorId, actorOrg, documentId, 'document', fabricTxId, true, null, req);

      return res.status(200).json({
        success: true,
        data: {
          permissionId,
          documentId,
          granteeOrg,
          status: 'ACTIVE',
          expiryAt: expiryAtDate,
          fabricTxId,
          isMockMode: !!fabricResult._mockMode
        }
      });
    } catch (err) {
      logger.error('Error granting access', { error: err.message });
      return res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

// ---------------------------------------------------------------------------
// POST /api/access/revoke
// ---------------------------------------------------------------------------
router.post(
  '/revoke',
  async (req, res) => {
    const rawOrg = req.body.granteeOrg || req.body.organization || req.body.grantee;
    const granteeOrg = normalizeOrg(rawOrg);
    const documentId = req.body.documentId;

    if (!documentId) {
      return res.status(422).json({ success: false, error: 'documentId is required' });
    }
    if (!['hospitala', 'hospitalb', 'diaglab'].includes(granteeOrg)) {
      return res.status(422).json({ success: false, error: 'Valid organization required' });
    }

    const actorId = req.user.userId;
    const actorOrg = req.user.organization;

    try {
      const docs = await query('SELECT * FROM documents WHERE document_id = ?', [documentId]);
      if (!docs.length) {
        return res.status(404).json({ success: false, error: 'Document not found' });
      }
      const doc = docs[0];

      if (req.user.role === 'patient' && doc.patient_id !== actorId) {
        return res.status(403).json({ success: false, error: 'Cannot revoke access to another patient\'s document' });
      }

      const granteeMSP = granteeOrg === 'hospitala' ? 'Org1MSP' : (granteeOrg === 'hospitalb' ? 'Org2MSP' : 'Org3MSP');

      // Submit RevokeAccess to Fabric
      let fabricResult;
      try {
        fabricResult = await fabricService.revokeAccessOnFabric(documentId, doc.patient_id, granteeMSP);
      } catch (fErr) {
        logger.error('Fabric revokeAccess failed', { error: fErr.message });
        await logAudit('ACCESS_REVOKE_FAILED', actorId, actorOrg, documentId, 'document', null, false, fErr.message, req);
        return res.status(502).json({ success: false, error: 'Blockchain error: ' + fErr.message });
      }

      const fabricTxId = fabricResult.txId;

      // Update DB record
      await query(
        `UPDATE access_permissions
         SET status = 'REVOKED', revoked_at = datetime('now'), fabric_revoke_tx_id = ?
         WHERE document_id = ? AND grantee_org = ? AND status = 'ACTIVE'`,
        [fabricTxId, documentId, granteeOrg]
      );

      await logAudit('ACCESS_REVOKED', actorId, actorOrg, documentId, 'document', fabricTxId, true, null, req);

      return res.status(200).json({
        success: true,
        data: {
          documentId,
          granteeOrg,
          status: 'REVOKED',
          fabricTxId,
          isMockMode: !!fabricResult._mockMode
        }
      });
    } catch (err) {
      logger.error('Error revoking access', { error: err.message });
      return res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

// ---------------------------------------------------------------------------
// GET /api/access/accessible-documents
// ---------------------------------------------------------------------------
router.get('/accessible-documents', async (req, res) => {
  try {
    const rows = await query(
      `SELECT DISTINCT d.document_id, d.patient_id, d.document_type, d.issuer_org,
              d.sha256_hash, d.original_filename, d.status, d.uploaded_at
       FROM documents d
       LEFT JOIN access_permissions ap ON ap.document_id = d.document_id
       WHERE d.issuer_org = ?
          OR (ap.grantee_org = ? AND ap.status = 'ACTIVE' AND (ap.expiry_at IS NULL OR ap.expiry_at > datetime('now')))
       ORDER BY d.uploaded_at DESC`,
      [req.user.organization, req.user.organization]
    );
    return res.status(200).json({ success: true, data: rows });
  } catch (err) {
    logger.error('Error fetching accessible documents', { error: err.message });
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/access/my-permissions
// ---------------------------------------------------------------------------
router.get('/my-permissions', async (req, res) => {
  try {
    let rows;
    if (req.user.role === 'patient') {
      rows = await query(
        `SELECT ap.*, d.original_filename, d.document_type
         FROM access_permissions ap
         JOIN documents d ON ap.document_id = d.document_id
         WHERE ap.patient_id = ?
         ORDER BY ap.granted_at DESC`,
        [req.user.userId]
      );
    } else {
      rows = await query(
        `SELECT ap.*, d.original_filename, d.document_type
         FROM access_permissions ap
         JOIN documents d ON ap.document_id = d.document_id
         WHERE ap.grantee_org = ? OR d.issuer_org = ?
         ORDER BY ap.granted_at DESC`,
        [req.user.organization, req.user.organization]
      );
    }

    return res.status(200).json({ success: true, data: rows });
  } catch (err) {
    logger.error('Error listing permissions', { error: err.message });
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/access/document/:documentId
// ---------------------------------------------------------------------------
router.get('/document/:documentId', async (req, res) => {
  const { documentId } = req.params;
  try {
    const rows = await query(
      `SELECT * FROM access_permissions WHERE document_id = ? ORDER BY granted_at DESC`,
      [documentId]
    );
    return res.status(200).json({ success: true, data: rows });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
