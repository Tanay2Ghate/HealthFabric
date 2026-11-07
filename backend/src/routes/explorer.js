'use strict';

/**
 * @module routes/explorer
 * Blockchain explorer routes:
 *   GET /api/explorer/transactions              – List transactions & audit logs
 *   GET /api/explorer/document/:documentId/history – Fabric history for a document
 *   GET /api/explorer/stats                     – System stats & ledger metrics
 */

const express = require('express');
const { query } = require('../config/db');
const { authenticate } = require('../middleware/auth');
const fabricService = require('../services/fabricService');
const logger = require('../utils/logger');

const router = express.Router();
router.use(authenticate);

// ---------------------------------------------------------------------------
// GET /api/explorer/transactions
// ---------------------------------------------------------------------------
router.get('/transactions', async (req, res) => {
  const { type, page = 1, limit = 20 } = req.query;
  const offset = (Math.max(1, parseInt(page, 10)) - 1) * parseInt(limit, 10);

  try {
    let sql = `
      SELECT id, event_type, actor_org, target_id, target_type, fabric_tx_id,
             event_timestamp, success, error_message
      FROM audit_logs
    `;
    const params = [];

    if (type) {
      sql += ` WHERE event_type LIKE ?`;
      params.push(`%${type}%`);
    }

    sql += ` ORDER BY event_timestamp DESC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit, 10), parseInt(offset, 10));

    const rows = await query(sql, params);

    // Get total count
    let countSql = `SELECT COUNT(*) as total FROM audit_logs`;
    const countParams = [];
    if (type) {
      countSql += ` WHERE event_type LIKE ?`;
      countParams.push(`%${type}%`);
    }
    const countRows = await query(countSql, countParams);
    const total = countRows[0]?.total || 0;

    return res.status(200).json({
      success: true,
      data: {
        transactions: rows,
        pagination: {
          page: parseInt(page, 10),
          limit: parseInt(limit, 10),
          total,
          totalPages: Math.ceil(total / parseInt(limit, 10))
        }
      }
    });
  } catch (err) {
    logger.error('Error fetching explorer transactions', { error: err.message });
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/explorer/document/:documentId/history
// ---------------------------------------------------------------------------
router.get('/document/:documentId/history', async (req, res) => {
  const { documentId } = req.params;

  try {
    // 1. Fetch ledger history from Fabric
    let fabricHistory = [];
    let isMock = false;
    try {
      const result = await fabricService.getDocumentHistoryFromFabric(documentId);
      fabricHistory = Array.isArray(result) ? result : (result?.history || []);
      isMock = !!result?._mockMode;
    } catch (fErr) {
      logger.warn('Fabric history fetch failed, returning DB logs', { error: fErr.message });
    }

    // 2. Fetch local audit history
    const auditLogs = await query(
      `SELECT * FROM audit_logs
       WHERE target_id = ?
       ORDER BY event_timestamp ASC`,
      [documentId]
    );

    // 3. Fetch permissions history
    const permissions = await query(
      `SELECT * FROM access_permissions
       WHERE document_id = ?
       ORDER BY granted_at ASC`,
      [documentId]
    );

    // 4. Fetch reviews history
    const reviews = await query(
      `SELECT review_id, doctor_org, review_hash, observations_summary, fabric_tx_id, created_at
       FROM doctor_reviews
       WHERE document_id = ?
       ORDER BY created_at ASC`,
      [documentId]
    );

    return res.status(200).json({
      success: true,
      data: {
        documentId,
        fabricHistory,
        auditLogs,
        permissions,
        reviews,
        isMockMode: isMock
      }
    });
  } catch (err) {
    logger.error('Error fetching document history', { error: err.message });
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/explorer/stats & /api/explorer/status
// ---------------------------------------------------------------------------
router.get(['/stats', '/status'], async (req, res) => {
  try {
    const docCount = (await query('SELECT COUNT(*) as count FROM documents'))[0]?.count || 0;
    const userCount = (await query('SELECT COUNT(*) as count FROM users'))[0]?.count || 0;
    const reviewCount = (await query('SELECT COUNT(*) as count FROM doctor_reviews'))[0]?.count || 0;
    const permCount = (await query("SELECT COUNT(*) as count FROM access_permissions WHERE status = 'ACTIVE'"))[0]?.count || 0;
    const txCount = (await query('SELECT COUNT(*) as count FROM audit_logs WHERE fabric_tx_id IS NOT NULL'))[0]?.count || 0;

    return res.status(200).json({
      success: true,
      data: {
        totalDocuments: docCount,
        totalUsers: userCount,
        totalReviews: reviewCount,
        activePermissions: permCount,
        blockchainTransactions: txCount,
        fabricMockMode: process.env.FABRIC_MOCK_MODE !== 'false'
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
