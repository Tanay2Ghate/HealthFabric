'use strict';

/**
 * @module routes/reviews
 * Doctor review routes:
 *   POST /api/reviews                       – Submit a clinical review
 *   GET  /api/reviews/document/:documentId  – Get reviews for a document
 *   GET  /api/reviews/:reviewId             – Get a specific review
 */

const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { body, param, validationResult } = require('express-validator');

const { query } = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const fabricService = require('../services/fabricService');
const fileService = require('../services/fileService');
const logger = require('../utils/logger');

const router = express.Router();
router.use(authenticate);

const REVIEWS_DIR = path.resolve(__dirname, '..', '..', 'uploads', 'encrypted', 'reviews');
if (!fs.existsSync(REVIEWS_DIR)) {
  fs.mkdirSync(REVIEWS_DIR, { recursive: true });
}

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
    logger.error('Failed to log audit in reviews', { error: err.message });
  }
}

// ---------------------------------------------------------------------------
// POST /api/reviews
// ---------------------------------------------------------------------------
router.post(
  '/',
  authorize('doctor'),
  [
    body('documentId').notEmpty().withMessage('documentId is required'),
    body('observationsSummary').trim().notEmpty().withMessage('Observation summary is required'),
    body('clinicalNotes').trim().notEmpty().withMessage('Clinical notes are required')
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({
        success: false,
        error: errors.array()[0].msg,
        errors: errors.array()
      });
    }

    const { documentId, observationsSummary, clinicalNotes } = req.body;
    const doctorId = req.user.userId;
    const doctorOrg = req.user.organization;

    try {
      // 1. Verify document exists
      const docs = await query('SELECT * FROM documents WHERE document_id = ?', [documentId]);
      if (!docs.length) {
        return res.status(404).json({ success: false, error: 'Document not found' });
      }
      const doc = docs[0];

      // 2. Check access permission if doctor's org is not document's issuer org
      if (doc.issuer_org !== doctorOrg) {
        const grants = await query(
          `SELECT * FROM access_permissions
           WHERE document_id = ? AND grantee_org = ? AND status = 'ACTIVE'
             AND (expiry_at IS NULL OR expiry_at > datetime('now'))`,
          [documentId, doctorOrg]
        );
        if (!grants.length) {
          return res.status(403).json({ success: false, error: 'Doctor organization has not been granted access to this document' });
        }
      }

      // 3. Generate review identifiers and SHA-256 hash
      const reviewId = `REV-${uuidv4()}`;
      const reviewPayload = JSON.stringify({
        reviewId,
        documentId,
        doctorId,
        doctorOrg,
        doctorName: req.user.fullName || 'Doctor',
        observationsSummary,
        clinicalNotes,
        timestamp: new Date().toISOString()
      });

      const reviewHash = crypto.createHash('sha256').update(reviewPayload).digest('hex');

      // 4. Digital signature (simulated doctor ECDSA / HMAC signature)
      const digitalSignature = crypto
        .createHmac('sha256', process.env.JWT_SECRET || 'doctor-key')
        .update(`${reviewId}:${reviewHash}:${doctorId}`)
        .digest('base64');

      // 5. Encrypt review content and save off-chain
      const encKey = crypto.randomBytes(32);
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv('aes-256-gcm', encKey, iv);
      const encrypted = Buffer.concat([cipher.update(Buffer.from(reviewPayload, 'utf8')), cipher.final()]);
      const authTag = cipher.getAuthTag();

      const encryptedPath = path.join(REVIEWS_DIR, `${reviewId}.enc`);
      const fileBundle = Buffer.concat([iv, authTag, encKey, encrypted]);
      fs.writeFileSync(encryptedPath, fileBundle);

      // 6. Submit review hash and reference to Fabric ledger
      const doctorMSP = doctorOrg === 'hospitala' ? 'Org1MSP' : (doctorOrg === 'hospitalb' ? 'Org2MSP' : 'Org3MSP');
      let fabricResult;
      try {
        fabricResult = await fabricService.addReviewOnFabric({
          reviewId,
          documentId,
          doctorId,
          doctorOrg: doctorMSP,
          reviewHash,
          observationsSummary,
          digitalSignature,
          timestamp: String(Math.floor(Date.now() / 1000))
        });
      } catch (fErr) {
        logger.error('Fabric AddDoctorReview failed', { error: fErr.message });
        await logAudit('REVIEW_CREATION_FAILED', doctorId, doctorOrg, documentId, 'document', null, false, fErr.message, req);
        return res.status(502).json({ success: false, error: 'Blockchain error: ' + fErr.message });
      }

      const fabricTxId = fabricResult.txId;

      // 7. Save to local SQLite database
      await query(
        `INSERT INTO doctor_reviews
           (review_id, document_id, doctor_id, doctor_org, review_hash, encrypted_review_path, observations_summary, digital_signature, fabric_tx_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [reviewId, documentId, doctorId, doctorOrg, reviewHash, encryptedPath, observationsSummary, digitalSignature, fabricTxId]
      );

      await logAudit('REVIEW_CREATED', doctorId, doctorOrg, reviewId, 'review', fabricTxId, true, null, req);

      return res.status(201).json({
        success: true,
        data: {
          reviewId,
          documentId,
          reviewHash,
          observationsSummary,
          digitalSignature,
          fabricTxId,
          isMockMode: !!fabricResult._mockMode
        }
      });
    } catch (err) {
      logger.error('Error submitting doctor review', { error: err.message });
      return res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

// ---------------------------------------------------------------------------
// GET /api/reviews/document/:documentId
// ---------------------------------------------------------------------------
router.get('/document/:documentId', async (req, res) => {
  const { documentId } = req.params;
  try {
    const reviews = await query(
      `SELECT r.review_id, r.document_id, r.doctor_id, r.doctor_org, r.review_hash,
              r.observations_summary, r.digital_signature, r.fabric_tx_id, r.created_at,
              u.full_name as doctor_name
       FROM doctor_reviews r
       LEFT JOIN users u ON r.doctor_id = u.user_id
       WHERE r.document_id = ?
       ORDER BY r.created_at DESC`,
      [documentId]
    );

    return res.status(200).json({ success: true, data: reviews });
  } catch (err) {
    logger.error('Error fetching document reviews', { error: err.message });
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/reviews/mine
// ---------------------------------------------------------------------------
router.get('/mine', async (req, res) => {
  try {
    const reviews = await query(
      `SELECT r.*, d.original_filename, d.document_type
       FROM doctor_reviews r
       JOIN documents d ON r.document_id = d.document_id
       WHERE r.doctor_id = ?
       ORDER BY r.created_at DESC`,
      [req.user.userId]
    );
    return res.status(200).json({ success: true, data: reviews });
  } catch (err) {
    logger.error('Error fetching doctor reviews', { error: err.message });
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/reviews/:reviewId
// ---------------------------------------------------------------------------
router.get('/:reviewId', async (req, res) => {
  const { reviewId } = req.params;
  try {
    const rows = await query('SELECT * FROM doctor_reviews WHERE review_id = ?', [reviewId]);
    if (!rows.length) {
      return res.status(404).json({ success: false, error: 'Review not found' });
    }
    const review = rows[0];

    // Read and decrypt clinical notes if encrypted file exists
    let decryptedContent = null;
    if (review.encrypted_review_path && fs.existsSync(review.encrypted_review_path)) {
      try {
        const fileBundle = fs.readFileSync(review.encrypted_review_path);
        const iv = fileBundle.subarray(0, 16);
        const authTag = fileBundle.subarray(16, 32);
        const encKey = fileBundle.subarray(32, 64);
        const encrypted = fileBundle.subarray(64);

        const decipher = crypto.createDecipheriv('aes-256-gcm', encKey, iv);
        decipher.setAuthTag(authTag);
        const dec = Buffer.concat([decipher.update(encrypted), decipher.final()]);
        decryptedContent = JSON.parse(dec.toString('utf8'));
      } catch (dErr) {
        logger.warn('Failed to decrypt review content', { error: dErr.message });
      }
    }

    return res.status(200).json({
      success: true,
      data: {
        ...review,
        clinicalNotes: decryptedContent?.clinicalNotes || null
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
