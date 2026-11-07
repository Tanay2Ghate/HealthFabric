'use strict';

/**
 * @module routes/auth
 * Authentication routes:
 *   POST /api/auth/register  – create a new user account
 *   POST /api/auth/login     – obtain a JWT
 *   POST /api/auth/logout    – invalidate the current JWT
 *   GET  /api/auth/me        – return current user profile
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const { body, validationResult } = require('express-validator');

const { query } = require('../config/db');
const { authenticate, blacklistToken } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BCRYPT_ROUNDS = 12;
const VALID_ROLES = ['patient', 'doctor', 'hospital_admin', 'lab_staff', 'admin'];
const VALID_ORGS = ['hospitala', 'hospitalb', 'diaglab'];

function userIdPrefix(role) {
  switch (role) {
    case 'patient':        return 'PAT';
    case 'doctor':         return 'DOC';
    case 'hospital_admin': return 'ADM';
    case 'lab_staff':      return 'LAB';
    case 'admin':          return 'SYS';
    default:               return 'USR';
  }
}

function generateUserId(role) {
  return `${userIdPrefix(role)}-${uuidv4()}`;
}

function issueJWT(user) {
  const secret = process.env.JWT_SECRET || 'healthchain-jwt-fallback-secret-2026';
  return jwt.sign(
    {
      userId: user.user_id,
      role: user.role,
      organization: user.organization,
    },
    secret,
    { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
  );
}

function safeUser(user) {
  const { password_hash, phone_hash, ...safe } = user;
  return safe;
}

async function logAudit(eventType, actorId, actorOrg, targetId, targetType, success, error, req) {
  try {
    await query(
      `INSERT INTO audit_logs
         (event_type, actor_user_id, actor_org, target_id, target_type, event_timestamp, ip_address, user_agent, success, error_message)
       VALUES (?, ?, ?, ?, ?, datetime('now'), ?, ?, ?, ?)`,
      [
        eventType, actorId, actorOrg, targetId, targetType,
        req.ip, req.get('User-Agent') || '', success, error || null,
      ]
    );
  } catch (err) {
    logger.error('Failed to write audit log', { error: err.message });
  }
}

// ---------------------------------------------------------------------------
// Validation chains
// ---------------------------------------------------------------------------

function normalizeOrg(raw) {
  if (!raw) return 'hospitala';
  const lower = raw.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (lower.includes('hospitalb') || lower.includes('metro') || lower.includes('orgb')) return 'hospitalb';
  if (lower.includes('lab') || lower.includes('diag') || lower.includes('org3')) return 'diaglab';
  return 'hospitala';
}

// ---------------------------------------------------------------------------
// POST /api/auth/register
// ---------------------------------------------------------------------------

router.post('/register', async (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  const password = req.body.password || '';
  const fullName = (req.body.full_name || req.body.fullName || req.body.name || '').trim();
  const rawRole = (req.body.role || 'patient').trim().toLowerCase();
  const role = VALID_ROLES.includes(rawRole) ? rawRole : 'patient';
  const organization = normalizeOrg(req.body.organization);
  let username = (req.body.username || (email.split('@')[0] || 'user')).trim().replace(/[^a-zA-Z0-9_]/g, '');

  if (username.length < 3) {
    username = `${username}_${Math.floor(100 + Math.random() * 900)}`;
  }

  // Basic validation checks
  if (!email || !email.includes('@')) {
    return res.status(422).json({ success: false, error: 'A valid email address is required' });
  }
  if (!password || password.length < 6) {
    return res.status(422).json({ success: false, error: 'Password must be at least 6 characters' });
  }
  if (!fullName || fullName.length < 2) {
    return res.status(422).json({ success: false, error: 'Full name is required (min 2 characters)' });
  }

  try {
    // Check for duplicate username / email
    const existing = await query(
      'SELECT id, email, username FROM users WHERE username = ? OR email = ? LIMIT 1',
      [username, email]
    );
    if (existing.length) {
      if (existing[0].email === email) {
        return res.status(409).json({ success: false, error: 'An account with this email already exists' });
      }
      // If username collided, append random digits
      username = `${username}_${Math.floor(1000 + Math.random() * 9000)}`;
    }

    const userId = generateUserId(role);
    const passwordHash = await bcrypt.hash(password, 10);
    const phoneHash = req.body.phone ? crypto.createHash('sha256').update(req.body.phone).digest('hex') : null;

    await query(
      `INSERT INTO users
         (user_id, username, email, password_hash, role, organization, fabric_identity_enrolled, full_name, phone_hash)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      [userId, username, email, passwordHash, role, organization, fullName, phoneHash]
    );

    await logAudit('USER_REGISTER', userId, organization, userId, 'user', true, null, req);

    logger.info('New user registered', { userId, username, role, organization });
    return res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: { userId, username, role, organization, fullName, email },
    });
  } catch (err) {
    logger.error('Register error', { error: err.message });
    await logAudit('USER_REGISTER', null, null, null, 'user', false, err.message, req);
    return res.status(500).json({ success: false, error: 'Registration failed: ' + err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/auth/login
// ---------------------------------------------------------------------------

router.post('/login', async (req, res) => {
  const rawIdentifier = req.body.email || req.body.username || '';
  const identifier = rawIdentifier.trim().toLowerCase();
  const password = req.body.password || '';

  if (!identifier || !password) {
    return res.status(400).json({ success: false, error: 'Email/username and password are required' });
  }

  try {
    const rows = await query(
      `SELECT * FROM users
       WHERE (LOWER(TRIM(email)) = ? OR LOWER(TRIM(username)) = ?)
         AND is_active = 1
       LIMIT 1`,
      [identifier, identifier]
    );

    if (!rows.length) {
      logger.warn('Login attempt with unknown email/username', { identifier });
      await logAudit('USER_LOGIN_FAILED', null, null, identifier, 'user', false, `Unknown identifier: ${identifier}`, req);
      return res.status(401).json({ success: false, error: 'Invalid email or password' });
    }

    const user = rows[0];
    const passwordMatch = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatch) {
      logger.warn('Login attempt failed: incorrect password', { identifier: user.email });
      await logAudit('USER_LOGIN_FAILED', user.user_id, user.organization, user.user_id, 'user', false, 'Bad password', req);
      return res.status(401).json({ success: false, error: 'Invalid email or password' });
    }

    const token = issueJWT(user);
    await logAudit('USER_LOGIN', user.user_id, user.organization, user.user_id, 'user', true, null, req);

    logger.info('User logged in', { userId: user.user_id, role: user.role });
    const userData = safeUser(user);
    return res.status(200).json({
      success: true,
      token,
      user: userData,
      data: {
        token,
        expiresIn: process.env.JWT_EXPIRES_IN || '8h',
        user: userData,
        ...userData
      },
    });
  } catch (err) {
    logger.error('Login error', { error: err.message });
    return res.status(500).json({ success: false, error: 'Login failed' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/auth/logout
// ---------------------------------------------------------------------------

router.post('/logout', authenticate, async (req, res) => {
  try {
    blacklistToken(req.user._token);
    await logAudit('USER_LOGOUT', req.user.userId, req.user.organization, req.user.userId, 'user', true, null, req);
    logger.info('User logged out', { userId: req.user.userId });
    return res.status(200).json({ success: true, message: 'Logged out successfully' });
  } catch (err) {
    logger.error('Logout error', { error: err.message });
    return res.status(500).json({ success: false, error: 'Logout failed' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/auth/me
// ---------------------------------------------------------------------------

router.get('/me', authenticate, async (req, res) => {
  try {
    const rows = await query(
      'SELECT user_id, username, email, role, organization, fabric_identity_enrolled, full_name, created_at, updated_at FROM users WHERE user_id = ?',
      [req.user.userId]
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const userProfile = rows[0];
    return res.status(200).json({
      success: true,
      user: userProfile,
      data: userProfile
    });
  } catch (err) {
    logger.error('Get profile error', { error: err.message });
    return res.status(500).json({ success: false, error: 'Failed to fetch profile' });
  }
});

module.exports = router;
