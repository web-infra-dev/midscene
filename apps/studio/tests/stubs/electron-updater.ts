// Test stub for `electron-updater`, wired in via `resolve.alias` in
// rstest.config.ts. The real package runs `require('electron').app.getVersion()`
// at module init, which throws outside Electron. rstest externalizes third-party
// deps in the node environment and *evaluates* them even when `rs.mock()`-ed, so
// the real init crashes before a mock can apply. Aliasing to this benign stub
// means the module rstest evaluates never touches Electron; individual tests
// that need specific behavior still layer `rs.mock('electron-updater', …)` on
// top. Keep the shape in sync with what `src/main/updater.ts` reads at import.
export const autoUpdater = {
  autoDownload: false,
  autoInstallOnAppQuit: false,
  channel: 'latest',
  allowPrerelease: false,
  allowDowngrade: false,
  on() {},
  removeAllListeners() {},
  checkForUpdates() {},
  downloadUpdate() {},
  quitAndInstall() {},
  getFeedURL() {
    return '';
  },
};
