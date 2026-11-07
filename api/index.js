'use strict';

/**
 * Vercel Serverless Function Entry Point
 * Routes all incoming /api/* requests to the Express application
 */
const app = require('../backend/src/app');

module.exports = app;
