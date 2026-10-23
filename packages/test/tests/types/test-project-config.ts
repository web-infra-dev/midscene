import { AndroidAgent } from '@midscene/android';
import {
  type AndroidSetupContext,
  createAdbAndroidSetup,
  runAdbShellInputSchema,
} from '@midscene/android/test';
import type {
  aiActOptionsInputSchema,
  locateOptionsInputSchema,
} from '@midscene/core/agent/test';
import type { ScriptPlayer } from '@midscene/core/yaml';
import { HarmonyAgent } from '@midscene/harmony';
import { runHdcShellInputSchema } from '@midscene/harmony/test';
import { IOSAgent } from '@midscene/ios';
import {
  type IOSSetupContext,
  type RunWdaRequestNodeInput,
  createWdaIOSSetup,
  runWdaRequestInputSchema,
} from '@midscene/ios/test';
import {
  type CaseDefinition,
  type CreateDocumentRuntimeOptions,
  type NodeExecutionContext,
  type NodeScopeTeardownResult,
  type NormalizedStepMeta,
  type RunCollectedCaseOptions,
  type RunWorkflowDocumentOptions,
  type WorkflowDocumentRuntime,
  type WorkflowDocumentSource,
  type createCaseId,
  type createWorkflowDocumentId,
  defineNode,
  z,
} from '@midscene/test';
import {
  type ExecutionProjectDefinition,
  type LoadedExecutionProject,
  type LoadedTestProject,
  type ProjectSetupDefinition,
  type TestFileSelection,
  type TestOutputDefinition,
  type TestProjectDefinition,
  type TestProjectRunOptions,
  type TestProjectRunResult,
  defineFileSetup,
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

// Compatibility controls must not silently become native Test parameters.
type Assert<T extends true> = T;
type Absent<T, K extends PropertyKey> = Extract<keyof T, K> extends never
  ? true
  : false;
type NativeBoundary = [
  Assert<Absent<TestProjectDefinition, 'legacy' | 'documentSetup'>>,
  Assert<Absent<LoadedTestProject, 'legacy' | 'hasExplicitTestTimeout'>>,
  Assert<
    Absent<
      ExecutionProjectDefinition,
      'retryScope' | 'fileConcurrency' | 'setupFile' | 'documentSetup'
    >
  >,
  Assert<Absent<TestOutputDefinition, 'report'>>,
  Assert<Absent<TestFileSelection, 'order'>>,
  Assert<Absent<ProjectSetupDefinition, 'onDocumentResult'>>,
  Assert<Absent<CaseDefinition, 'onFailure'>>,
  Assert<
    Absent<NormalizedStepMeta, 'resultName' | 'resultPath' | 'captureResult'>
  >,
  Assert<Absent<NodeExecutionContext['$'], 'resultName' | 'captureResult'>>,
  Assert<Absent<NodeScopeTeardownResult, 'reportSources'>>,
  Assert<Absent<TestProjectRunOptions, 'legacyPlan' | 'writeLegacySummary'>>,
  Assert<Absent<TestProjectRunResult, 'legacyResults'>>,
  Assert<Absent<RunCollectedCaseOptions, 'reportScopeId'>>,
  Assert<
    Absent<
      RunWorkflowDocumentOptions,
      'documentSetup' | 'documentAttemptIndex' | 'resolveCaseReportScopeId'
    >
  >,
  Assert<
    Absent<
      CreateDocumentRuntimeOptions,
      'documentSetup' | 'documentAttemptIndex'
    >
  >,
  Assert<Absent<WorkflowDocumentRuntime, 'signal'>>,
  Assert<
    Absent<
      Awaited<ReturnType<WorkflowDocumentRuntime['start']>>,
      'reportSources' | 'reportScopeId'
    >
  >,
  Assert<Absent<WorkflowDocumentSource, 'invocationIndex'>>,
  Assert<Absent<z.output<typeof locateOptionsInputSchema>, 'uiContext'>>,
  Assert<
    Absent<
      ScriptPlayer<any>,
      'executionResult' | 'executionRecord' | 'fallbackReportFileName'
    >
  >,
];
type CaseIdArity = Assert<
  Parameters<typeof createCaseId>['length'] extends 3 ? true : false
>;
type LegacyPlayerRunArity = Assert<
  Parameters<ScriptPlayer<any>['run']>['length'] extends 0 ? true : false
>;
type DocumentIdArity = Assert<
  Parameters<typeof createWorkflowDocumentId>['length'] extends 2 ? true : false
>;
type ApprovedEffort = z.output<typeof aiActOptionsInputSchema>;
const effortOptions: ApprovedEffort = { effort: 'deepThink' };
void effortOptions;
// @ts-expect-error Report naming is deliberately not a native configuration option.
defineTestProject({ output: { report: { fileName: 'custom' } } });
defineTestProject({
  projects: [
    {
      name: 'native',
      nodes: [
        {
          name: 'business',
          execute(ctx) {
            // @ts-expect-error Adapter result bindings are not public Node metadata.
            ctx.$.resultName;
          },
        },
      ],
    },
  ],
});

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
      setup({ env }) {
        return { baseURL: env.TEST_BASE_URL ?? 'https://example.com' };
      },
    }),
  });

void project;
void loadTestProject<ProjectContext>();

interface FileContext {
  token: string;
}
const fileSetup = defineFileSetup<FileContext, ProjectContext>({
  name: 'file',
  setup({ projectContext, file, env, signal, onTeardown }) {
    projectContext?.baseURL satisfies string | undefined;
    file.sourcePath satisfies string;
    file.documentRunId satisfies string;
    env.TEST_TOKEN satisfies string | undefined;
    signal.throwIfAborted();
    onTeardown(async () => {});
    return { token: 'independent' };
  },
});
defineTestProject<FileContext, ProjectContext>({
  setup: defineProjectSetup<ProjectContext>({
    name: 'shared',
    setup: () => ({ baseURL: 'https://example.com' }),
  }),
  fileSetup,
  nodes: [
    {
      name: 'file.read',
      execute({ context }) {
        context.token satisfies string;
        // @ts-expect-error File Nodes receive only the context returned by fileSetup.
        context.baseURL;
      },
    },
  ],
  test: {
    maxConcurrentFiles: 3,
    setupTimeout: 120_000,
    teardownTimeout: 30_000,
  },
});
defineFileSetup<FileContext, ProjectContext>({
  name: 'invalid',
  // @ts-expect-error File setup must return the configured FileContext.
  setup: () => ({ baseURL: 'https://example.com' }),
});
void loadTestProject<FileContext, ProjectContext>();

const webSetup = defineProjectSetup<ProjectContext>({
  name: 'web',
  setup({ project, onTeardown }) {
    project.projectId satisfies string;
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
  test: { maxConcurrentProjects: 2, bail: 1, testTimeout: 30_000 },
  nodes: [projectNode],
});

defineTestProject<ProjectContext>({
  projects: [
    {
      name: 'project-only',
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
defineTestProject({ projects: [{ name: 'empty' }] });

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
      files: { include: ['web/**/*.yaml'] },
      nodes: createMidsceneNodes<PlatformContext>({
        agentClass: PlaywrightAgent,
        getAgent: ({ context }) => context.playwright,
      }),
    },
    {
      name: 'android',
      files: { include: ['android/**/*.yaml'] },
      nodes: createMidsceneNodes<PlatformContext>({
        agentClass: AndroidAgent,
        getAgent: ({ context }) => context.android,
      }),
    },
    {
      name: 'ios',
      files: { include: ['ios/**/*.yaml'] },
      nodes: createMidsceneNodes<PlatformContext>({
        agentClass: IOSAgent,
        getAgent: ({ context }) => context.ios,
      }),
    },
    {
      name: 'harmony',
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

// Platform capabilities come from setup resources and registered Nodes.
defineTestProject({ projects: [{ name: 'checkout', setup: webSetup }] });
defineTestProject({
  projects: [
    {
      name: 'checkout',
      // @ts-expect-error Projects no longer declare a platform.
      platform: 'web',
    },
  ],
});
defineProjectSetup({
  name: 'browser',
  // @ts-expect-error Setups no longer declare supported platforms.
  platform: 'web',
  setup() {},
});

// Limits can be removed independently without changing the other default.
defineTestProject({
  test: { maxConcurrentFiles: null, maxConcurrentProjects: null },
});
defineTestProject({ test: { maxConcurrentProjects: 2 } });
defineTestProject({
  test: {
    // @ts-expect-error Project and file concurrency use separate named limits.
    maxConcurrency: 2,
  },
});

// Platform setup factories work at both supported resource scopes.

const adbSetup: ProjectSetupDefinition<AndroidSetupContext> =
  createAdbAndroidSetup({
    deviceId: 'usb-serial',
    androidAdbPath: '/custom/adb',
  });
const wdaSetup: ProjectSetupDefinition<IOSSetupContext> = createWdaIOSSetup({
  wdaHost: 'localhost',
  wdaPort: 8100,
  sessionId: 'existing-session',
});
defineTestProject<AndroidSetupContext>({ setup: adbSetup });
defineTestProject<IOSSetupContext>({ setup: wdaSetup });
defineTestProject<AndroidSetupContext, undefined>({
  projects: [{ name: 'adb-file', fileSetup: createAdbAndroidSetup() }],
});
defineTestProject<IOSSetupContext, undefined>({
  projects: [{ name: 'wda-file', fileSetup: createWdaIOSSetup() }],
});
defineFileSetup<AndroidSetupContext, { custom: string }>(
  createAdbAndroidSetup(),
);
defineFileSetup<IOSSetupContext, { custom: string }>(createWdaIOSSetup());
// @ts-expect-error WDA selection is by endpoint, not an Android-style device ID.
createWdaIOSSetup({ deviceId: 'ios-udid' });
// @ts-expect-error The standard WDA factory does not select an alternative driver.
createWdaIOSSetup({ iOSDeviceClassOverride: 'another-driver' });

// Factory contexts must preserve the public root Agent type identity.
const adbAgentFromSetup = (context: AndroidSetupContext): AndroidAgent =>
  context.agent;
const iosAgentFromSetup = (context: IOSSetupContext): IOSAgent => context.agent;
