// commitlint.config.js
const fs = require('node:fs');
const path = require('node:path');

// read subdirectories of the directory
function getSubdirectories(dir) {
  if (!fs.existsSync(dir)) return [];

  return fs
    .readdirSync(dir, {
      withFileTypes: true
    })
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => dirent.name);
}

// get subdirectories of the directory
const appsScopes = getSubdirectories(path.join(__dirname, 'apps'));
const packagesScopes = getSubdirectories(path.join(__dirname, 'packages'));

// merge all scopes and remove duplicates
const allScopes = [
  // basic scopes
  'workflow',
  'llm',
  'playwright',
  'puppeteer',
  'mcp',
  'blog',
  'bridge',
  'record',
  // automatically added scopes
  ...appsScopes,
  ...packagesScopes,
];

// remove duplicates
const uniqueScopes = [...new Set(allScopes)];

module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-enum': [
      2, // Level: Error
      'always', // Apply rule always
      uniqueScopes,
    ],
    // Add rule to disallow empty scopes
    'scope-empty': [2, 'never'],
  },
};