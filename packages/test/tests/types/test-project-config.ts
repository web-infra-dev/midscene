import type { AndroidAgent } from '@midscene/android';
import type { IOSAgent } from '@midscene/ios';
import { defineNode, z } from '@midscene/test';
import {
  type AndroidRunnerAgent,
  createAndroidNodes,
  runAdbShellInputSchema,
} from '@midscene/test/android';
import {
  type TestProjectDefinition,
  defineProjectSetup,
  defineTestProject,
  loadTestProject,
} from '@midscene/test/config';
import {
  type IOSRunnerAgent,
  type RunWdaRequestNodeInput,
  createIOSNodes,
  runWdaRequestInputSchema,
} from '@midscene/test/ios';
import {
  clearCookiesInputSchema,
  createPlaywrightNodes,
  gotoUrlInputSchema,
  setCookiesInputSchema,
  setViewportSizeInputSchema,
} from '@midscene/test/playwright';
import type { Page } from 'playwright';

interface ProjectContext {
  baseURL: string;
}

const requestNode = defineNode<
  { path: string },
  { status: number },
  ProjectContext
>({
  name: 'http.get',
  execute({ input, context }) {
    const url = new URL(input.path, context.baseURL);
    return { data: { status: url.port.length } };
  },
});

const project: TestProjectDefinition<ProjectContext> =
  defineTestProject<ProjectContext>({
    nodes: [requestNode],
    setup: defineProjectSetup<ProjectContext>({
      name: 'default-web',
      platform: 'web',
      setup({ env }) {
        return { baseURL: env.TEST_BASE_URL ?? 'https://example.com' };
      },
    }),
  });

void project;
void loadTestProject<ProjectContext>();

const webSetup = defineProjectSetup<ProjectContext>({
  name: 'web',
  platform: 'web',
  setup({ project, onTeardown }) {
    project.projectId satisfies string;
    project.platform satisfies 'web' | 'android' | 'ios' | 'computer';
    onTeardown(({ context }) => {
      context?.baseURL satisfies string | undefined;
    });
    return { baseURL: 'https://example.com' };
  },
});

const projectNode = defineNode<unknown, unknown, ProjectContext>({
  name: 'project.read',
  execute({ context }) {
    context.baseURL satisfies string;
  },
});

defineTestProject<ProjectContext>({
  projects: [
    {
      name: 'web',
      platform: 'web',
      setup: webSetup,
      files: {
        include: ['cases/**/*.yaml'],
        exclude: ['cases/**/*.draft.yaml'],
      },
      tags: { include: ['smoke'], exclude: ['manual'] },
      retry: 1,
      variables: { locale: 'en-US' },
    },
  ],
  test: { maxConcurrency: 2, bail: 1, testTimeout: 30_000 },
  nodes: [projectNode],
});

const schemaInput = z.strictObject({
  path: z.string(),
  retries: z.coerce.number().int().default(0),
});

defineNode({
  name: 'schema.inferred',
  inputSchema: schemaInput,
  execute({ input }) {
    input.path satisfies string;
    input.retries satisfies number;
    // @ts-expect-error Schema inference does not add unknown fields.
    input.missing;
  },
});

defineNode<typeof schemaInput, { status: number }, ProjectContext>({
  name: 'schema.context',
  inputSchema: schemaInput,
  execute({ input, context }) {
    return {
      data: {
        status: new URL(input.path, context.baseURL).port.length,
      },
    };
  },
});

defineTestProject({
  nodes: [],
  projects: [
    {
      name: 'web',
      platform: 'web',
      files: {
        // @ts-expect-error files.include must be an array.
        include: 'workflows/*.yaml',
      },
    },
  ],
});

defineNode<unknown, unknown, ProjectContext>({
  name: 'invalid.context',
  execute({ context }) {
    // @ts-expect-error ProjectContext has no token field.
    return { data: context.token };
  },
});

// @ts-expect-error Workflow Project API was removed before the first release.
import { defineWorkflowProject } from '@midscene/test/config';
// @ts-expect-error Synchronous config loading is not supported.
import { loadTestProjectSync } from '@midscene/test/config';

void defineWorkflowProject;
void loadTestProjectSync;

interface PlatformContext {
  page: Page;
  baseUrl: string;
  android: {
    launch(uri: string): Promise<void>;
    terminate(uri: string): Promise<void>;
    runAdbShell(
      command: string,
      options?: { timeout?: number },
    ): Promise<string>;
  };
  ios: {
    launch(uri: string): Promise<void>;
    terminate(uri: string): Promise<void>;
    runWdaRequest(input: {
      method: 'GET' | 'POST' | 'DELETE' | 'PUT';
      endpoint: string;
      data?: Record<string, unknown>;
    }): Promise<unknown>;
  };
}

createPlaywrightNodes<PlatformContext>({
  getPage: ({ context }) => context.page,
  getBaseUrl: ({ context }) => context.baseUrl,
  getCookieProfile: ({ context }) => context.page.context().cookies(),
});

createAndroidNodes<PlatformContext>({
  getAgent: ({ context }) => context.android,
});

createIOSNodes<PlatformContext>({
  getAgent: ({ context }) => context.ios,
});

declare const androidAgent: AndroidAgent;
declare const iosAgent: IOSAgent;
declare const androidRunnerAgent: AndroidRunnerAgent;
declare const iosRunnerAgent: IOSRunnerAgent;
declare const iosAgentInput: Parameters<IOSAgent['runWdaRequest']>[0];
declare const iosRunnerInput: RunWdaRequestNodeInput;

createAndroidNodes({ getAgent: () => androidAgent });
createIOSNodes({ getAgent: () => iosAgent });
androidAgent satisfies AndroidRunnerAgent;
iosAgent satisfies IOSRunnerAgent;
androidRunnerAgent.runAdbShell satisfies AndroidAgent['runAdbShell'];
iosRunnerAgent.runWdaRequest satisfies IOSAgent['runWdaRequest'];
iosAgentInput satisfies RunWdaRequestNodeInput;
iosRunnerInput satisfies Parameters<IOSAgent['runWdaRequest']>[0];

void gotoUrlInputSchema;
void setCookiesInputSchema;
void clearCookiesInputSchema;
void setViewportSizeInputSchema;
void runAdbShellInputSchema;
void runWdaRequestInputSchema;
