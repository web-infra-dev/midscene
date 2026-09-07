import { version } from '../../package.json';

export const createPlatforms = ['web', 'android', 'ios'] as const;
export type CreatePlatform = (typeof createPlatforms)[number];

export interface NodePackageSpec {
  name: string;
  version: string;
}

/** Registry packages only: keep the install spec separate from the import name. */
export function parseNodePackageSpec(spec: string): NodePackageSpec {
  const match =
    /^(?:(@[a-z0-9][a-z0-9._-]*)\/)?([a-z0-9][a-z0-9._-]*)(?:@([a-zA-Z0-9^~*>=<|. +_-]+))?$/.exec(
      spec,
    );
  if (!match || (match[3] !== undefined && !match[3].trim())) {
    throw new Error(
      `Invalid Node package "${spec}". Use an npm package name with an optional version, such as @acme/test-nodes@1.2.0.`,
    );
  }
  return {
    name: `${match[1] ? `${match[1]}/` : ''}${match[2]}`,
    version: match[3] ?? 'latest',
  };
}

const platformImports: Record<CreatePlatform, string> = {
  web: `import { PlaywrightAgent } from '@midscene/web/playwright';
import { createPlaywrightNodes } from '@midscene/test/playwright';
import { chromium, type Page } from 'playwright';`,
  android: `import { AndroidAgent, agentFromAdbDevice } from '@midscene/android';`,
  ios: `import { IOSAgent, agentFromWebDriverAgent } from '@midscene/ios';`,
};

const agentClasses: Record<CreatePlatform, string> = {
  web: 'PlaywrightAgent',
  android: 'AndroidAgent',
  ios: 'IOSAgent',
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
};

export function createProjectFiles(
  name: string,
  platform: CreatePlatform,
  packages: readonly NodePackageSpec[],
): Record<string, string> {
  const agentClass = agentClasses[platform];
  const imports = packages
    .map(
      (pkg, index) =>
        `import { createMidsceneTestNodes as createPackageNodes${index} } from ${JSON.stringify(pkg.name)};`,
    )
    .join('\n');
  const extraNodes = packages
    .map(
      (_, index) =>
        `    ...createPackageNodes${index}<ProjectContext>({ platform: '${platform}', getAgent }),`,
    )
    .join('\n');
  const config = `import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import type { NodeExecutionContext } from '@midscene/test';
import { defineProjectSetup, defineTestProject } from '@midscene/test/config';
import { createMidsceneNodes } from '@midscene/test/midscene';
${platformImports[platform]}
${imports}

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
${extraNodes}
  ],
});
`;
  const dependencies: Record<string, string> = {
    '@midscene/test': version,
    [`@midscene/${platform === 'web' ? 'web' : platform}`]: version,
    '@types/node': '^20.0.0',
    dotenv: '^16.4.5',
    typescript: '^5.8.3',
    ...(platform === 'web' ? { playwright: '^1.45.0' } : {}),
  };
  for (const pkg of packages) {
    if (Object.hasOwn(dependencies, pkg.name)) {
      throw new Error(
        `Node package "${pkg.name}" conflicts with a generated project dependency.`,
      );
    }
    dependencies[pkg.name] = pkg.version;
  }
  const env =
    platform === 'web'
      ? 'HEADLESS=true\n'
      : platform === 'android'
        ? '# Optional: choose a device from adb devices.\nANDROID_DEVICE_ID=\n'
        : 'WDA_HOST=localhost\nWDA_PORT=8100\n';
  return {
    'package.json': `${JSON.stringify(
      {
        name,
        private: true,
        type: 'module',
        scripts: {
          test: 'midscene-test',
          'describe-nodes': 'midscene-test describe-nodes > midscene-nodes.md',
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
        : 'cases:\n  - name: Inspect the home screen\n    steps:\n      - home: {}\n      - aiAsk: Describe the current screen\n',
    '.env.example': `# Copy this file to .env and configure your model before running tests.\n# See https://midscenejs.com/model-config.html\nMIDSCENE_MODEL_BASE_URL=\nMIDSCENE_MODEL_API_KEY=\nMIDSCENE_MODEL_NAME=\nMIDSCENE_MODEL_FAMILY=\n\n${env}`,
    '.gitignore': 'node_modules/\n.env\nmidscene_run/\n',
    'README.md': `# ${name}\n\nA Midscene Test Runner project for ${platform}.\n\nCopy \`.env.example\` to \`.env\` and fill in your [model configuration](https://midscenejs.com/model-config.html).\n\n${platform === 'web' ? 'Install Chromium before the first test: `pnpm exec playwright install chromium`.' : platform === 'android' ? 'Connect an Android device and verify it with `adb devices`. Set ANDROID_DEVICE_ID to select a device.' : 'Start WebDriverAgent and set WDA_HOST and WDA_PORT for your iOS device.'}\n\nRun tests with \`pnpm test\`. Read \`midscene-nodes.md\` for the available Nodes and their inputs.\n\nAfter changing Node registrations in \`midscene.config.ts\`, run \`pnpm run describe-nodes\` to refresh the reference. This loads the configuration without connecting to a device or running tests. Extension factories must only acquire runtime resources inside Node execution.\n\n${packages.length ? `Node packages: ${packages.map((pkg) => `\`${pkg.name}\``).join(', ')}. Their \`createMidsceneTestNodes\` factories are imported in the configuration.\n\n` : ''}Reports are written to \`midscene_run/report/\`.\n`,
    'README.zh.md': `# ${name}\n\n面向 ${platform} 平台的 Midscene Test Runner 项目。\n\n将 \`.env.example\` 复制为 \`.env\`，填写[模型配置](https://midscenejs.com/zh/model-config.html)。\n\n${platform === 'web' ? '首次测试前，运行 `pnpm exec playwright install chromium` 安装 Chromium。' : platform === 'android' ? '连接 Android 设备并通过 `adb devices` 检查连接。可通过 ANDROID_DEVICE_ID 选择设备。' : '启动 WebDriverAgent，并通过 WDA_HOST 和 WDA_PORT 配置 iOS 设备连接。'}\n\n运行 \`pnpm test\` 执行测试。可用 Node 及其参数详见 \`midscene-nodes.md\`。\n\n修改 \`midscene.config.ts\` 中的 Node 注册配置后，运行 \`pnpm run describe-nodes\` 更新说明书。此过程会加载配置，但不会连接设备或执行测试。扩展工厂应在 Node 执行阶段获取运行时资源。\n\n${packages.length ? `已接入的 Node 包：${packages.map((pkg) => `\`${pkg.name}\``).join('、')}。配置文件显式导入了这些包的 \`createMidsceneTestNodes\` 工厂。\n\n` : ''}测试报告保存在 \`midscene_run/report/\`。\n`,
  };
}
