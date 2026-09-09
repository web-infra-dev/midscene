import { AndroidAgent } from '@midscene/android';
import { runAdbShellInputSchema } from '@midscene/android/test';
import { HarmonyAgent } from '@midscene/harmony';
import { runHdcShellInputSchema } from '@midscene/harmony/test';
import { IOSAgent } from '@midscene/ios';
import {
  type RunWdaRequestNodeInput,
  runWdaRequestInputSchema,
} from '@midscene/ios/test';
import { defineNode, z } from '@midscene/test';
import {
  type LoadedExecutionProject,
  type TestProjectDefinition,
  defineProjectSetup,
  defineTestProject,
  loadTestProject,
} from '@midscene/test/config';
import { createMidsceneNodes } from '@midscene/test/midscene';
import {
  PlaywrightAgent,
  PlaywrightBrowserAgent,
} from '@midscene/web/playwright/agent';
import {
  clearCookiesInputSchema,
  gotoUrlInputSchema,
  setCookiesInputSchema,
  setViewportSizeInputSchema,
} from '@midscene/web/playwright/test';

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
    project.platform satisfies
      | 'web'
      | 'android'
      | 'ios'
      | 'harmony'
      | 'computer';
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
      nodes: [requestNode],
      files: {
        include: ['cases/**/*.yaml'],
        exclude: ['cases/**/*.draft.yaml'],
      },
      tags: { include: ['smoke'], exclude: ['manual'] },
      retry: 1,
      variables: { locale: 'en-US' },
    },
    {
      name: 'web-override',
      platform: 'web',
      setup: webSetup,
      files: { include: ['override/**/*.yaml'] },
      nodes: [
        {
          name: 'project.read',
          execute({ context }) {
            context.baseURL satisfies string;
            // @ts-expect-error The second Project preserves the configured context.
            context.token;
            return { summary: context.baseURL };
          },
        },
      ],
    },
  ],
  test: { maxConcurrency: 2, bail: 1, testTimeout: 30_000 },
  nodes: [projectNode],
});

defineTestProject<ProjectContext>({
  projects: [
    {
      name: 'project-only',
      platform: 'web',
      setup: webSetup,
      nodes: [
        requestNode,
        {
          name: 'project.context',
          execute({ context }) {
            context.baseURL satisfies string;
            // @ts-expect-error Local Nodes share the configured ProjectContext.
            context.token;
          },
        },
      ],
    },
  ],
});

defineTestProject({});
defineTestProject({ projects: [{ name: 'empty', platform: 'web' }] });

declare const loadedExecutionProject: LoadedExecutionProject<ProjectContext>;
loadedExecutionProject.nodes.names() satisfies string[];
loadTestProject<ProjectContext>().then((loaded) => {
  loaded.projects[0] satisfies LoadedExecutionProject<ProjectContext>;
  loaded.projects[0].nodes.names() satisfies string[];
});

defineTestProject<ProjectContext>({
  projects: [
    {
      name: 'invalid-nodes',
      platform: 'web',
      // @ts-expect-error Project-local Nodes must be an array.
      nodes: requestNode,
    },
  ],
});

const incompatibleContextNode = defineNode<unknown, unknown, { token: string }>(
  {
    name: 'token.context',
    execute({ context }) {
      return { summary: context.token };
    },
  },
);

defineTestProject<ProjectContext>({
  projects: [
    {
      name: 'invalid-context',
      platform: 'web',
      nodes: [
        // @ts-expect-error Local Nodes must accept the Project's configured context.
        incompatibleContextNode,
      ],
    },
  ],
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
  playwright: PlaywrightAgent;
  android: AndroidAgent;
  ios: IOSAgent;
  harmony: HarmonyAgent;
}

defineTestProject<PlatformContext>({
  projects: [
    {
      name: 'web',
      platform: 'web',
      files: { include: ['web/**/*.yaml'] },
      nodes: createMidsceneNodes<PlatformContext>({
        agentClass: PlaywrightAgent,
        getAgent: ({ context }) => context.playwright,
      }),
    },
    {
      name: 'android',
      platform: 'android',
      files: { include: ['android/**/*.yaml'] },
      nodes: createMidsceneNodes<PlatformContext>({
        agentClass: AndroidAgent,
        getAgent: ({ context }) => context.android,
      }),
    },
    {
      name: 'ios',
      platform: 'ios',
      files: { include: ['ios/**/*.yaml'] },
      nodes: createMidsceneNodes<PlatformContext>({
        agentClass: IOSAgent,
        getAgent: ({ context }) => context.ios,
      }),
    },
    {
      name: 'harmony',
      platform: 'harmony',
      files: { include: ['harmony/**/*.yaml'] },
      nodes: createMidsceneNodes<PlatformContext>({
        agentClass: HarmonyAgent,
        getAgent: ({ context }) => context.harmony,
      }),
    },
  ],
});

declare const androidAgent: AndroidAgent;
declare const iosAgent: IOSAgent;
declare const harmonyAgent: HarmonyAgent;
declare const iosAgentInput: Parameters<IOSAgent['runWdaRequest']>[0];
declare const iosRunnerInput: RunWdaRequestNodeInput;

createMidsceneNodes({ agentClass: AndroidAgent, getAgent: () => androidAgent });
createMidsceneNodes({ agentClass: IOSAgent, getAgent: () => iosAgent });
createMidsceneNodes({ agentClass: HarmonyAgent, getAgent: () => harmonyAgent });
iosAgentInput satisfies RunWdaRequestNodeInput['request'];
iosRunnerInput.request satisfies Parameters<IOSAgent['runWdaRequest']>[0];

void gotoUrlInputSchema;
void setCookiesInputSchema;
void clearCookiesInputSchema;
void setViewportSizeInputSchema;
void runAdbShellInputSchema;
void runWdaRequestInputSchema;
void runHdcShellInputSchema;

// Both supported Playwright Agent classes use the common registration entry.
declare const playwrightPageAgent: PlaywrightAgent;
declare const playwrightBrowserAgent: PlaywrightBrowserAgent;
createMidsceneNodes({
  agentClass: PlaywrightAgent,
  getAgent: () => playwrightPageAgent,
});
createMidsceneNodes({
  agentClass: PlaywrightBrowserAgent,
  getAgent: () => playwrightBrowserAgent,
});
