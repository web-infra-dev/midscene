import { appendFileSync } from 'node:fs';

const log = (message) =>
  appendFileSync(process.env.WORKFLOW_E2E_LOG, `${message}\n`);

export default class FixtureDevice {
  interfaceType = 'custom';
  constructor() {
    log('device:created');
  }
  actionSpace() {
    return [];
  }
  async evaluateJavaScript(script) {
    log(script);
  }
  async destroy() {
    log('device:destroyed');
  }
}
