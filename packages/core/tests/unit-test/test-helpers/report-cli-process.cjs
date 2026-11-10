// Exercise the published Node CLI runtime with fake actions and a real Agent writer.
const { createRequire } = require('node:module');
const path = require('node:path');
const [coreEntry, platform, ...argv] = process.argv.slice(2);
const req = createRequire(coreEntry);
const { Agent } = req('./agent/agent.js');
const { BaseMidsceneTools } = req('@midscene/shared/agent-tools/base-tools');
const { runToolsCLI } = req('@midscene/shared/cli');
const { createReportCliCommands } = req('./report-cli.js');
const png =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADUlEQVQImWNgYGD4DwABBAEAfbLI3wAAAABJRU5ErkJggg==';
class Tools extends BaseMidsceneTools {
  getCliReportSessionName() {
    return `midscene-${platform}`;
  }
  createTemporaryDevice() {
    return { actionSpace: () => [] };
  }
  async ensureAgent() {
    if (!this.agent) {
      const agent = new Agent(
        {
          interfaceType: 'puppeteer',
          actionSpace: () => [],
          screenshotBase64: async () => png,
          destroy: async () => {},
        },
        {
          ...this.readCliReportAgentOptions(),
          autoPrintReportMsg: false,
          modelConfig: {
            MIDSCENE_MODEL_NAME: 'fixture',
            MIDSCENE_MODEL_API_KEY: 'unused',
          },
        },
      );
      agent.aiAction = async (prompt) => agent.recordToReport(prompt);
      agent.aiAssert = async (prompt) => {
        await agent.recordErrorToReport(prompt, {
          error: new Error('planned assertion failure'),
          screenshotBase64: png,
        });
        throw new Error('planned assertion failure');
      };
      this.agent = agent;
    }
    return this.agent;
  }
  preparePlatformTools() {
    return [
      {
        name: 'connect',
        description: 'Connect a fake target',
        schema: {},
        handler: async () => {
          this.commitCliReportSession(
            this.createNewCliReportSession('fake-device'),
          );
          return { content: [{ type: 'text', text: 'connected' }] };
        },
      },
    ];
  }
}
const run = () =>
  runToolsCLI(new Tools(), `midscene-${platform}`, {
    argv,
    extraCommands: createReportCliCommands(),
  }).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
if (process.send) {
  process.once('message', run);
  process.send('ready');
} else {
  run();
}
