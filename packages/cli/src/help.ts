const versionFromPkgJson = require('../package.json').version;

if (process.argv.indexOf('--help') !== -1) {
  console.log(`@midscene/cli v${versionFromPkgJson}

Midscene.js helps you automate browser actions, assertions, and data extraction by AI.
Usage: midscene <path-to-yaml-file-or-directory>

For more information, please refer to https://midscenejs.com/automate-with-scripts-in-yaml`);
  process.exit(0);
} else if (process.argv.indexOf('--version') !== -1) {
  console.log(`@midscene/cli version ${versionFromPkgJson}`);
  process.exit(0);
}
