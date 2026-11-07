'use strict';

/**
 * @module utils/logger
 * Centralised winston logger.
 * Log level is controlled by NODE_ENV:
 *   production  → info
 *   development → debug
 *   test        → warn
 */

const { createLogger, format, transports } = require('winston');
const path = require('path');
const fs = require('fs');

const isVercel = Boolean(process.env.VERCEL);
const logsDir = path.resolve(__dirname, '..', '..', 'logs');
if (!isVercel && !fs.existsSync(logsDir)) {
  try {
    fs.mkdirSync(logsDir, { recursive: true });
  } catch (e) {
    // Ignore error if filesystem is read-only
  }
}

const level = (() => {
  switch (process.env.NODE_ENV) {
    case 'production': return 'info';
    case 'test':       return 'warn';
    default:           return 'debug';
  }
})();

const defaultTransports = [];
if (!isVercel) {
  try {
    defaultTransports.push(
      new transports.File({
        filename: path.join(logsDir, 'error.log'),
        level: 'error',
        maxsize: 20 * 1024 * 1024, // 20 MB
        maxFiles: 10,
      }),
      new transports.File({
        filename: path.join(logsDir, 'combined.log'),
        maxsize: 20 * 1024 * 1024,
        maxFiles: 10,
      })
    );
  } catch (err) {
    // Read-only filesystem fallback
  }
}

// Always ensure console transport if on Vercel or in development
if (isVercel || process.env.NODE_ENV !== 'production' || defaultTransports.length === 0) {
  defaultTransports.push(
    new transports.Console({
      format: format.combine(
        format.colorize(),
        format.printf(({ timestamp, level, message, ...meta }) => {
          const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
          return `${timestamp} [${level}]: ${message}${metaStr}`;
        })
      ),
    })
  );
}

const logger = createLogger({
  level,
  format: format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
    format.errors({ stack: true }),
    format.splat(),
    format.json()
  ),
  defaultMeta: { service: 'healthchain-backend' },
  transports: defaultTransports,
});

module.exports = logger;
