import { version } from '../../package.json';
import {
  type CreatePackageManager,
  packageManagerCommands,
} from './create-package-manager';

export const createPlatforms = [
  'web',
  'android',
  'ios',
  'harmony',
  'computer',
] as const;
export type CreatePlatform = (typeof createPlatforms)[number];

export const createPlatformLabels: Record<CreatePlatform, string> = {
  web: 'Web (Playwright)',
  android: 'Android',
  ios: 'iOS',
  harmony: 'HarmonyOS',
  computer: 'Desktop (Computer)',
};

const platformImports: Record<CreatePlatform, string> = {
  web: `import { PlaywrightAgent } from '@midscene/web/playwright/agent';
import { createPlaywrightNodes } from '@midscene/web/playwright/test';
import { chromium, type Page } from 'playwright';`,
  android: `import { AndroidAgent, agentFromAdbDevice } from '@midscene/android';`,
  ios: `import { IOSAgent, agentFromWebDriverAgent } from '@midscene/ios';`,
  harmony: `import { HarmonyAgent, agentFromHdcDevice } from '@midscene/harmony';`,
  computer: `import { ComputerAgent, agentForComputer } from '@midscene/computer';`,
};

const agentClasses: Record<CreatePlatform, string> = {
  web: 'PlaywrightAgent',
  android: 'AndroidAgent',
  ios: 'IOSAgent',
  harmony: 'HarmonyAgent',
  computer: 'ComputerAgent',
};

const platformSetup: Record<CreatePlatform, string> = {
  web: `    const browser = await chromium.launch({ headless: env.HEADLESS !== 'false' });
    onTeardown(() => browser.close());
    const page = await browser.newPage();
    const context: ProjectContext = { page };
    onTeardown(async () => { await context.agent?.destroy(); });
    return context;`,
  android: `    const agent = await agentFromAdbDevice(env.ANDROID_DEVICE_ID || undefined);
    onTeardown(() => agent.destroy());
    return { agent };`,
  ios: `    const port = Number(env.WDA_PORT || 8100);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error('WDA_PORT must be an integer between 1 and 65535.');
    }
    const agent = await agentFromWebDriverAgent({
      wdaHost: env.WDA_HOST || 'localhost',
      wdaPort: port,
    });
    onTeardown(() => agent.destroy());
    return { agent };`,
  harmony: `    const agent = await agentFromHdcDevice(env.HARMONY_DEVICE_ID || undefined);
    onTeardown(() => agent.destroy());
    return { agent };`,
  computer: `    const agent = await agentForComputer({
      displayId: env.COMPUTER_DISPLAY_ID || undefined,
    });
    onTeardown(() => agent.destroy());
    return { agent };`,
};

const platformEnv: Record<CreatePlatform, string> = {
  web: 'HEADLESS=true\n',
  android:
    '# Optional: choose a device from adb devices.\nANDROID_DEVICE_ID=\n',
  ios: 'WDA_HOST=localhost\nWDA_PORT=8100\n',
  harmony:
    '# Optional: choose a device from hdc list targets.\nHARMONY_DEVICE_ID=\n',
  computer:
    '# Optional: select a display; leave empty for the default display.\nCOMPUTER_DISPLAY_ID=\n# Enable Xvfb on headless Linux after installing its dependencies.\nMIDSCENE_COMPUTER_HEADLESS_LINUX=false\n',
};

const platformInstructions: Record<Exclude<CreatePlatform, 'web'>, string> = {
  android:
    'Connect an Android device and verify it with `adb devices`. Set ANDROID_DEVICE_ID to select a device.',
  ios: 'Start WebDriverAgent and set WDA_HOST and WDA_PORT for your iOS device.',
  harmony:
    'Connect a HarmonyOS device and verify it with `hdc list targets`. Set HARMONY_DEVICE_ID to select a device. Set HDC_HOME if hdc is not on PATH.',
  computer:
    'Prepare the local desktop using the [desktop setup guide](https://midscenejs.com/platforms/desktop.html), including system dependencies and permissions. Set COMPUTER_DISPLAY_ID to select a display. For headless Linux, install Xvfb and enable MIDSCENE_COMPUTER_HEADLESS_LINUX.',
};

export function createProjectFiles(
  name: string,
  platform: CreatePlatform,
  packageManager: CreatePackageManager,
): Record<string, string> {
  const instructions =
    platform === 'web'
      ? `Install Chromium before the first test: \`${packageManagerCommands[packageManager].installChromium}\`.`
      : platformInstructions[platform];
  const agentClass = agentClasses[platform];
  const config = `import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import type { NodeExecutionContext } from '@midscene/test';
import { defineProjectSetup, defineTestProject } from '@midscene/test/config';
import { createMidsceneNodes } from '@midscene/test/midscene';
${platformImports[platform]}

loadEnv({ path: fileURLToPath(new URL('.env', import.meta.url)) });

interface ProjectContext {
${platform === 'web' ? '  page: Page;\n  agent?: PlaywrightAgent;' : `  agent: ${agentClass};`}
}

const getAgent = ({ context }: NodeExecutionContext<unknown, ProjectContext>) => {
${platform === 'web' ? '  context.agent ??= new PlaywrightAgent(context.page);' : ''}
  return context.agent;
};

const setup = defineProjectSetup<ProjectContext>({
  name: '${platform}',
  platform: '${platform}',
  async setup({ env, onTeardown }) {
${platformSetup[platform]}
  },
});

export default defineTestProject<ProjectContext>({
  projects: [{
    name: '${platform}',
    platform: '${platform}',
    setup,
    files: { include: ['cases/**/*.{yaml,yml}'] },
  }],
  nodes: [
    ...createMidsceneNodes<ProjectContext>({ agentClass: ${agentClass}, getAgent }),
${platform === 'web' ? '    ...createPlaywrightNodes<ProjectContext>({ getPage: ({ context }) => context.page }),' : ''}
  ],
});
`;
  const dependencies: Record<string, string> = {
    '@midscene/test': version,
    [`@midscene/${platform}`]: version,
    '@types/node': '^20.0.0',
    dotenv: '^16.4.5',
    typescript: '^5.8.3',
    ...(platform === 'web' ? { playwright: '^1.45.0' } : {}),
  };
  const env = platformEnv[platform];
  return {
    'package.json': `${JSON.stringify(
      {
        name,
        private: true,
        type: 'module',
        scripts: {
          test: 'midscene-test',
          nodes: 'midscene-test nodes',
          postinstall: 'midscene-test nodes',
        },
        engines: { node: '^20.19.0 || ^22.12.0 || >=24.0.0' },
        devDependencies: dependencies,
      },
      null,
      2,
    )}\n`,
    'midscene.config.ts': config,
    'tsconfig.json': `${JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2022',
          module: 'ESNext',
          moduleResolution: 'Bundler',
          strict: true,
          noEmit: true,
          skipLibCheck: true,
          types: ['node'],
        },
        include: ['midscene.config.ts'],
      },
      null,
      2,
    )}\n`,
    'cases/example.yaml':
      platform === 'web'
        ? 'cases:\n  - name: Open example.com\n    steps:\n      - gotoUrl: https://example.com\n      - aiAssert: The page displays the heading Example Domain\n'
        : platform === 'computer'
          ? 'cases:\n  - name: Inspect the desktop\n    steps:\n      - aiAsk: Describe the current desktop\n'
          : 'cases:\n  - name: Inspect the home screen\n    steps:\n      - home: {}\n      - aiAsk: Describe the current screen\n',
    '.env.example': `# Copy this file to .env and configure your model before running tests.\n# See https://midscenejs.com/model-config.html\nMIDSCENE_MODEL_BASE_URL=\nMIDSCENE_MODEL_API_KEY=\nMIDSCENE_MODEL_NAME=\nMIDSCENE_MODEL_FAMILY=\n\n${env}`,
    '.gitignore': 'node_modules/\n.env\nmidscene_run/\n',
    'README.md': `# ${name}\n\nA Midscene Test project for ${platform}.\n\nIf you skipped installation during creation, run \`${packageManager} ${packageManagerCommands[packageManager].install.join(' ')}\`. The \`postinstall\` script automatically generates \`midscene-node-reference.md\` after each dependency installation. If lifecycle scripts are disabled, run \`${packageManager} run nodes\` manually.\n\nCopy \`.env.example\` to \`.env\` and fill in your [model configuration](https://midscenejs.com/model-config.html).\n\n${instructions}\n\nRun tests with \`${packageManager} test\`. Read \`midscene-node-reference.md\` for the available Nodes and their inputs.\n\nAfter changing Node registrations in \`midscene.config.ts\`, run \`${packageManager} run nodes\` to refresh the reference. This loads the configuration without connecting to a device or running tests. Extension factories must only acquire runtime resources inside Node execution.\n\nReports are written to \`midscene_run/report/\`.\n`,
  };
}
