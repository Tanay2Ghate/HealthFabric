'use strict';

/**
 * @module middleware/auth
 * JWT authentication and role/org-based authorisation middleware.
 *
 * Middleware:
 *  - authenticate          – verifies Bearer JWT, attaches req.user
 *  - authorize(...roles)   – factory: allows only specified roles
 *  - authorizeOrg(...orgs) – factory: allows only specified organisations
 */

const jwt = require('jsonwebtoken');
const { query } = require('../config/db');
const logger = require('../utils/logger');

// In-memory token blacklist for logout invalidation.
// In production replace with Redis or a DB-backed set.
const tokenBlacklist = new Set();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractToken(req) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }
  return null;
}

function sendUnauthorized(res, message = 'Unauthorized') {
  return res.status(401).json({ success: false, error: message });
}

function sendForbidden(res, message = 'Forbidden') {
  return res.status(403).json({ success: false, error: message });
}

// ---------------------------------------------------------------------------
// authenticate
// ---------------------------------------------------------------------------

/**
 * Verifies the Bearer JWT in the Authorization header.
 * On success, attaches req.user = { userId, role, organization, fabricIdentity }.
 */
async function authenticate(req, res, next) {
  const token = extractToken(req);
  if (!token) {
    return sendUnauthorized(res, 'No token provided');
  }

  // Check blacklist
  if (tokenBlacklist.has(token)) {
    return sendUnauthorized(res, 'Token has been invalidated');
  }

  let decoded;
  try {
    const secret = process.env.JWT_SECRET || 'healthchain-jwt-fallback-secret-2026';
    decoded = jwt.verify(token, secret);
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return sendUnauthorized(res, 'Token expired');
    }
    return sendUnauthorized(res, 'Invalid token');
  }

  // Confirm the user still exists and is active in the DB
  try {
    const rows = await query(
      'SELECT user_id, role, organization, fabric_identity_enrolled, is_active FROM users WHERE user_id = ?',
      [decoded.userId]
    );

    if (!rows.length || !rows[0].is_active) {
      return sendUnauthorized(res, 'User account not found or deactivated');
    }

    const user = rows[0];
    req.user = {
      userId: user.user_id,
      role: user.role,
      organization: user.organization,
      fabricIdentity: user.fabric_identity_enrolled,
      // Carry the raw token so logout middleware can blacklist it
      _token: token,
    };

    next();
  } catch (err) {
    logger.error('authenticate: DB lookup failed', { error: err.message });
    return res.status(500).json({ success: false, error: 'Authentication service error' });
  }
}

// ---------------------------------------------------------------------------
// authorize (role-based)
// ---------------------------------------------------------------------------

/**
 * Middleware factory: only proceeds if req.user.role is in the allowed list.
 *
 * @param {...string} roles - Allowed roles
 */
function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return sendUnauthorized(res);
    }
    if (!roles.includes(req.user.role)) {
      logger.warn('authorize: role not permitted', {
        userId: req.user.userId,
        userRole: req.user.role,
        required: roles,
      });
      return sendForbidden(res, `Role '${req.user.role}' is not permitted to perform this action`);
    }
    next();
  };
}

// ---------------------------------------------------------------------------
// authorizeOrg (organisation-based)
// ---------------------------------------------------------------------------

/**
 * Middleware factory: only proceeds if req.user.organization is in the allowed list.
 *
 * @param {...string} orgs - Allowed organisations
 */
function authorizeOrg(...orgs) {
  return (req, res, next) => {
    if (!req.user) {
      return sendUnauthorized(res);
    }
    if (!orgs.includes(req.user.organization)) {
      logger.warn('authorizeOrg: org not permitted', {
        userId: req.user.userId,
        userOrg: req.user.organization,
        required: orgs,
      });
      return sendForbidden(res, `Organisation '${req.user.organization}' is not permitted`);
    }
    next();
  };
}

// ---------------------------------------------------------------------------
// Token blacklist helpers (used by auth routes)
// ---------------------------------------------------------------------------

function blacklistToken(token) {
  tokenBlacklist.add(token);
}

module.exports = { authenticate, authorize, authorizeOrg, blacklistToken };
