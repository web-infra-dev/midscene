// commitlint.config.js
const fs = require('node:fs');
const path = require('node:path');

// read subdirectories of the directory
function getSubdirectories(dir) {
  if (!fs.existsSync(dir)) return [];

  return fs
    .readdirSync(dir, { withFileTypes: true })
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
  'bridge',
  // automatically added scopes
  ...appsScopes,
  ...packagesScopes,
];

// remove duplicates
const uniqueScopes = [...new Set(allScopes)];

module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-empty': [0, 'never'],   // allow empty scope
    'type-empty':  [0, 'never'],   // allow empty type
    'scope-enum':  [0, 'always'],  // no scope whitelist
  },
};
