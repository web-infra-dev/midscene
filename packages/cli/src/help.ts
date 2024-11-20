const versionFromPkgJson = require('../package.json').version;

if (process.argv.indexOf('--help') !== -1) {
  console.log(`@midscene/cli v${versionFromPkgJson}

Midscene.js helps you automate browser actions, assertions, and data extraction by AI.
Usage: midscene <path-to-yaml-file-or-directory> [options]

Options:
  --headed  Run the browser in headed mode to see the browser UI (default: false)
  --keep-window  Keep the browser window open after the script finishes. This is useful when debugging, but will consume more resources (default: false)

For more information, please refer to https://midscenejs.com/automate-with-scripts-in-yaml`);
  process.exit(0);
} else if (process.argv.indexOf('--version') !== -1) {
  console.log(`@midscene/cli version ${versionFromPkgJson}`);
  process.exit(0);
}
