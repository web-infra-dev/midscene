const preset = require('@midscene/bdd/profile').defineProfile();

module.exports = {
  ...preset,
  // Simulates a user-supplied config that lost the preset's `not @flow`
  // guard — used by the standalone-@flow regression test (M5).
  'no-flow-guard': {
    import: preset.default.import,
    format: preset.default.format,
  },
};
