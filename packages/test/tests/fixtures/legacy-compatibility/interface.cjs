const { appendFileSync, existsSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const { runInNewContext } = require('node:vm');

/** Deterministic Interface shared by the migrated legacy YAML fixtures. */
module.exports = class LegacyCompatibilityInterface {
  interfaceType = 'legacy-compatibility-fixture';

  constructor(options) {
    this.options = options;
    this.state = {};
    this.record('device:created');
  }

  record(value) {
    appendFileSync(this.options.log, `${JSON.stringify(value)}\n`);
  }

  actionSpace() {
    return [];
  }

  describe() {
    return 'deterministic legacy YAML compatibility fixture';
  }

  async size() {
    return { width: 1, height: 1 };
  }

  async screenshotBase64() {
    return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=';
  }

  marker(name, suffix = 'marker') {
    if (!/^[a-z-]+$/.test(name)) throw new Error('Invalid marker name');
    return join(this.options.root, `${name}.${suffix}`);
  }

  async evaluateJavaScript(script) {
    return runInNewContext(
      script,
      {
        state: this.state,
        record: (value) => this.record(value),
        mark: (name) => writeFileSync(this.marker(name), 'ready'),
        waitFor: async (name) => {
          const deadline = Date.now() + 10_000;
          while (!existsSync(this.marker(name))) {
            if (Date.now() > deadline)
              throw new Error(`Barrier timed out: ${name}`);
            await new Promise((resolve) => setTimeout(resolve, 10));
          }
        },
        failOnce: (name) => {
          const marker = this.marker(name, 'once');
          if (!existsSync(marker)) {
            writeFileSync(marker, 'failed');
            throw new Error(`Intentional first ${name} failure`);
          }
        },
      },
      { timeout: 1000 },
    );
  }

  async destroy() {
    this.record('device:destroyed');
  }
};
