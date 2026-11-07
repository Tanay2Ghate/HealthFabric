'use strict';

/**
 * @module config/db
 * SQLite database adapter using Node's built-in DatabaseSync (or sqlite3 fallback).
 * Provides a drop-in promise-based `query(sql, params)` interface matching MySQL semantics.
 */

const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const logger = require('../utils/logger');

const isVercel = Boolean(process.env.VERCEL);
let resolvedDbPath = process.env.DB_PATH;
if (!resolvedDbPath) {
  if (isVercel) {
    resolvedDbPath = path.join('/tmp', 'healthchain.db');
    const seedDbPath = path.resolve(__dirname, '..', '..', 'healthchain.db');
    if (!fs.existsSync(resolvedDbPath) && fs.existsSync(seedDbPath)) {
      try {
        fs.copyFileSync(seedDbPath, resolvedDbPath);
        logger.info('Copied pre-seeded SQLite database to /tmp for Vercel execution');
      } catch (copyErr) {
        logger.warn('Could not copy seed database to /tmp', { error: copyErr.message });
      }
    }
  } else {
    resolvedDbPath = path.resolve(__dirname, '..', '..', 'healthchain.db');
  }
}
const DB_PATH = resolvedDbPath;
const SCHEMA_FILE = path.resolve(__dirname, '..', '..', '..', 'database', 'schema.sqlite.sql');

let dbInstance = null;

function getDatabase() {
  if (dbInstance) return dbInstance;

  // Use Node.js built-in DatabaseSync
  try {
    const { DatabaseSync } = require('node:sqlite');
    dbInstance = new DatabaseSync(DB_PATH);
    logger.info('Connected to SQLite database via node:sqlite', { path: DB_PATH });
  } catch (err) {
    logger.warn('node:sqlite not available, attempting sqlite3 package...', { error: err.message });
    try {
      const sqlite3 = require('sqlite3').verbose();
      const rawDb = new sqlite3.Database(DB_PATH);
      // Synchronous compatibility shim
      dbInstance = {
        exec: (sql) => {
          rawDb.exec(sql);
        },
        prepare: (sql) => {
          return {
            all: (...params) => {
              return new Promise((resolve, reject) => {
                rawDb.all(sql, params, (e, rows) => (e ? reject(e) : resolve(rows)));
              });
            },
            run: (...params) => {
              return new Promise((resolve, reject) => {
                rawDb.run(sql, params, function (e) {
                  e ? reject(e) : resolve({ changes: this.changes, lastInsertRowid: this.lastID });
                });
              });
            }
          };
        }
      };
      logger.info('Connected to SQLite database via sqlite3 package', { path: DB_PATH });
    } catch (sqlite3Err) {
      logger.error('Failed to initialize SQLite database', { error: sqlite3Err.message });
      throw sqlite3Err;
    }
  }

  initDatabase(dbInstance);
  return dbInstance;
}

function initDatabase(db) {
  try {
    if (fs.existsSync(SCHEMA_FILE)) {
      const schema = fs.readFileSync(SCHEMA_FILE, 'utf8');
      db.exec(schema);
      logger.info('SQLite schema initialized');
    } else {
      logger.warn('Schema file not found at ' + SCHEMA_FILE);
    }

    seedInitialUsers(db);
  } catch (err) {
    logger.error('Error during database schema/seed initialization', { error: err.message });
  }
}

function seedInitialUsers(db) {
  logger.info('Seeding initial test users into SQLite...');

  const users = [
    {
      userId: 'PAT-00000001',
      username: 'alice_patient',
      email: 'alice@hospitala.example.com',
      password: 'Patient@123',
      role: 'patient',
      organization: 'hospitala',
      fullName: 'Alice Johnson'
    },
    {
      userId: 'DOC-00000001',
      username: 'bob_doctor',
      email: 'bob@hospitala.example.com',
      password: 'Doctor@123',
      role: 'doctor',
      organization: 'hospitala',
      fullName: 'Dr. Robert Smith'
    },
    {
      userId: 'ADM-00000001',
      username: 'carol_admin',
      email: 'carol@hospitala.example.com',
      password: 'Admin@123',
      role: 'hospital_admin',
      organization: 'hospitala',
      fullName: 'Carol Williams'
    },
    {
      userId: 'ADM-00000002',
      username: 'david_admin_b',
      email: 'david@hospitalb.example.com',
      password: 'Admin@123',
      role: 'hospital_admin',
      organization: 'hospitalb',
      fullName: 'David Miller'
    },
    {
      userId: 'LAB-00000001',
      username: 'lab_staff_1',
      email: 'lab@diaglab.example.com',
      password: 'Lab@12345',
      role: 'lab_staff',
      organization: 'diaglab',
      fullName: 'Diagnostic Lab Staff'
    }
  ];

  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO users (user_id, username, email, password_hash, role, organization, full_name, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1)
  `);

  for (const u of users) {
    try {
      const hash = bcrypt.hashSync(u.password, 10);
      insertStmt.run(u.userId, u.username, u.email, hash, u.role, u.organization, u.fullName);
    } catch (e) {
      logger.warn(`Could not seed user ${u.username}`, { error: e.message });
    }
  }

  logger.info('Initial users successfully seeded');
}

/**
 * Execute parameterized SQL query.
 *
 * @param {string} sql
 * @param {Array} params
 * @returns {Promise<Array|Object>}
 */
async function query(sql, params = []) {
  const db = getDatabase();
  const start = Date.now();
  try {
    // Normalise boolean TRUE/FALSE in SQL to 1/0 for safe SQLite execution
    let normalizedSql = sql.replace(/\bTRUE\b/g, '1').replace(/\bFALSE\b/g, '0');

    // SQLite does not support "ON DUPLICATE KEY UPDATE" or MySQL specific functions like SHA2
    // Positional parameters ? work identically.

    // Sanitize parameters for SQLite (convert booleans to 1/0, undefined to null)
    const sanitizedParams = params.map((p) => {
      if (typeof p === 'boolean') return p ? 1 : 0;
      if (p === undefined) return null;
      return p;
    });

    const isSelect = /^\s*(SELECT|PRAGMA|WITH|EXPLAIN)/i.test(normalizedSql);
    const stmt = db.prepare(normalizedSql);

    if (isSelect) {
      const results = stmt.all(...sanitizedParams);
      logger.debug('DB query executed', {
        sql: normalizedSql.substring(0, 100),
        durationMs: Date.now() - start,
        rowCount: results.length
      });
      return results;
    } else {
      const res = stmt.run(...sanitizedParams);
      const resultObj = {
        affectedRows: res.changes !== undefined ? res.changes : 0,
        insertId: res.lastInsertRowid !== undefined ? Number(res.lastInsertRowid) : 0,
        changes: res.changes,
        lastInsertRowid: res.lastInsertRowid
      };
      logger.debug('DB mutation executed', {
        sql: normalizedSql.substring(0, 100),
        durationMs: Date.now() - start,
        changes: resultObj.affectedRows
      });
      return resultObj;
    }
  } catch (err) {
    logger.error('DB query error', {
      sql: sql.substring(0, 100),
      error: err.message
    });
    throw err;
  }
}

/**
 * Execute multiple statements in a transaction
 * @param {Function} callback
 */
async function withTransaction(callback) {
  const db = getDatabase();
  db.exec('BEGIN TRANSACTION');
  try {
    const transactionQuery = async (sql, params = []) => query(sql, params);
    const result = await callback(transactionQuery);
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    logger.error('DB transaction rolled back', { error: err.message });
    throw err;
  }
}

module.exports = {
  getDatabase,
  query,
  withTransaction
};
