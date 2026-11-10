const { appendFile, writeFile } = require('node:fs/promises');
const { existsSync } = require('node:fs');

/** Deterministic device for published-entry acceptance; no browser or model. */
module.exports = class LegacyInterface {
  interfaceType = 'compatibility-fixture';
  constructor(options) {
    this.options = options;
  }
  actionSpace() {
    return [];
  }
  describe() {
    return 'deterministic compatibility device';
  }
  async size() {
    return { width: 1, height: 1 };
  }
  async screenshotBase64() {
    return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=';
  }
  async evaluateJavaScript(script) {
    if (this.options.actionLog)
      await appendFile(this.options.actionLog, `${script}\n`);
    if (script === 'fail once' && !existsSync(this.options.failureMarker)) {
      await writeFile(this.options.failureMarker, 'failed');
      throw new Error('fixture action failed once');
    }
    return { echoed: script };
  }
  async destroy() {
    await new Promise((resolve) => setTimeout(resolve, 20));
    await writeFile(this.options.cleanupFile, 'closed');
    if (this.options.failCleanup) throw new Error('fixture cleanup failed');
  }
};
