// CommonJS wrapper for compatibility
const path = require('node:path');
const fs = require('node:fs');

// Re-export from main entry
module.exports = require('../dist/cjs/src/index.js');
