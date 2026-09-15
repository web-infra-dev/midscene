import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { NodeRegistry } from '../engine/registry';
import { WorkflowParseError } from '../errors';
import { createDocumentInvocationId } from '../parser/identifiers';
import type { CreateYamlPlayerOptions } from '../runtime/create-yaml-player';
import { loadDotenvConfig } from '../runtime/dotenv-loader';
import {
  type YamlSharedBrowserContext,
  assertBrowserContextUsage,
  createYamlBatchBrowser,
  createYamlSharedBrowserProjectSetup,
} from '../runtime/legacy-browser';
import {
  type LegacyTestRunPlan,
  defaultLegacyConfig,
  matchLegacyYamlFiles,
} from '../runtime/legacy-config';
import {
  type LegacyYamlDocumentArtifact,
  createLegacyYamlDocumentHost,
} from '../runtime/legacy-document-host';
import {
  getYamlProjectPlayerOptions,
  isYamlReportEnabled,
} from '../runtime/yaml-setup';
import type {
  PreparedExecutionProject,
  PreparedRunPublication,
  ProjectPreparationOptions,
  TestProjectRunOptions,
  TestRunInput,
} from './execution-plan';
import {
  type LegacyWorkflow,
  adaptLegacyExecutionPlan,
} from './legacy-adapter';
import {
  collectLegacyWorkflow,
  isLegacyWorkflowFile,
} from './legacy-collector';
import { createLegacyTestRunPlan } from './legacy-command';
import { writeLegacyTestSummary } from './legacy-summary';
import { CONFIG_NAMES, matchesTags } from './project-preparation';
import type { LoadedTestProject } from './test-project';

/** Private host controls; not exported by the native Test SDK. */
export interface YamlCompatibilityRunOptions {
  plan?: LegacyTestRunPlan;
  writeSummary?: boolean;
  getPlayerOptions?(
    context: unknown,
  ): CreateYamlPlayerOptions | Promise<CreateYamlPlayerOptions>;
}

/** Everything returned to preparation is a resolved policy or a host binding. */
interface YamlRunPreparation {
  usesDefaultConfiguration: boolean;
  preflightScope: 'project' | 'run';
  configure(definition: LoadedTestProject<unknown>): LoadedTestProject<unknown>;
  projectOptions: ProjectPreparationOptions;
  validate(projects: readonly PreparedExecutionProject[]): void;
  publications(
    projects: readonly PreparedExecutionProject[],
  ): PreparedRunPublication[];
}

/** Resolve old configuration only here; native-only runs never load legacy env. */
export async function prepareYamlCompatibility(
  input: TestRunInput,
  options: TestProjectRunOptions,
  compatibility: YamlCompatibilityRunOptions = {},
): Promise<YamlRunPreparation> {
  let plan =
    compatibility.plan ??
    (await createLegacyTestRunPlan({
      cwd: input.cwd,
      projectRoot: input.filePattern ?? input.singleFile ?? input.projectRoot,
      configPath: options.configPath
        ? resolve(input.configSearchRoot, options.configPath)
        : undefined,
    }));
  if (
    !plan &&
    !options.configPath &&
    !CONFIG_NAMES.some((name) => existsSync(join(input.configSearchRoot, name)))
  ) {
    const files = await matchLegacyYamlFiles(
      input.singleFile ?? input.projectRoot,
    );
    if (files.length && files.every(isLegacyWorkflowFile))
      plan = {
        ...defaultLegacyConfig,
        files,
        summary: `summary-${Date.now()}.json`,
        bail: 1,
      };
  }
  if (plan && options.projectNames?.length)
    throw new Error(
      '--project requires a TypeScript project config. Use files in the legacy batch config.',
    );
  if (plan) loadDotenvConfig({ cwd: input.cwd, ...plan });

  const workflows = new Map<string, LegacyWorkflow>();
  const artifacts = new Map<string, LegacyYamlDocumentArtifact[]>();
  const projectOptions: ProjectPreparationOptions = {
    ...(plan
      ? {
          files: plan.files,
          prerequisiteFile: plan.setup,
          documentConcurrency: plan.concurrent,
          platform: 'auto',
        }
      : input.singleFile
        ? { files: [input.singleFile] }
        : {}),
    async collectDocument(source, project) {
      const workflow = await collectLegacyWorkflow(
        source,
        input.cwd,
        plan?.globalConfig,
      );
      if (!workflow) {
        if (plan)
          throw new WorkflowParseError(
            'Legacy batch options require tasks/flow YAML. Use a TypeScript project config for native cases.',
            { sourcePath: source.sourcePath },
          );
        return undefined;
      }
      const { document } = workflow;
      // Legacy selection applies to a whole file, including an empty task list;
      // it must not turn tasks into independently selected/retried Cases.
      if (source.absolutePath !== plan?.setup && !matchesTags([], project.tags))
        return { filteredCaseCount: document.cases.length };
      workflows.set(document.documentId, workflow);
      const documentArtifacts: LegacyYamlDocumentArtifact[] = [];
      artifacts.set(document.documentId, documentArtifacts);
      const host = createLegacyYamlDocumentHost({
        file: source.absolutePath,
        script: workflow.script,
        options: async (context) => {
          const sharedBrowser = (
            context.projectContext as YamlSharedBrowserContext | undefined
          )?.yamlBrowser;
          // Only a retried prerequisite resets the shared browser. Business-file
          // retries keep the previous setup state, as the old host did.
          if (
            plan?.setup === source.absolutePath &&
            context.document.attemptIndex > 0
          )
            await sharedBrowser?.reset();
          if (plan)
            return {
              headed: plan.headed,
              keepWindow: plan.keepWindow,
              ...sharedBrowser?.options,
            };
          return compatibility.getPlayerOptions
            ? compatibility.getPlayerOptions(context.projectContext)
            : getYamlProjectPlayerOptions(context.projectContext);
        },
        onArtifact: (artifact) => documentArtifacts.push(artifact),
      });
      const registry = new NodeRegistry(host.nodes);
      return {
        filteredCaseCount: 0,
        invocation: {
          document,
          retry: { scope: 'document', count: project.retry },
          reportEnabled: isYamlReportEnabled(workflow.script),
          bindings: {
            resolveNode: registry.require.bind(registry),
            documentSetup: host.documentSetup,
            onStepResult: host.onStepResult,
            resolveCaseReportScopeId: (_case, _attempt, documentRunId) =>
              documentRunId,
          },
        },
      };
    },
  };

  return {
    usesDefaultConfiguration: !!plan,
    preflightScope: plan ? 'run' : 'project',
    projectOptions,
    configure(definition) {
      if (!plan) return definition;
      const adapted = adaptLegacyExecutionPlan(plan, input.projectRoot);
      return {
        ...definition,
        test: { ...definition.test, maxConcurrency: 1, bail: adapted.bail },
        projects: [
          {
            ...definition.projects[0],
            ...adapted.project,
            ...(plan.shareBrowserContext
              ? {
                  setup: createYamlSharedBrowserProjectSetup(
                    plan,
                    createYamlBatchBrowser,
                  ),
                }
              : {}),
          },
        ],
      };
    },
    validate(projects) {
      if (!plan) return;
      const inputs = projects.flatMap((project) =>
        project.invocations.flatMap((invocation) => {
          const workflow = workflows.get(invocation.document.documentId);
          return workflow
            ? [
                {
                  file: workflow.source.absolutePath,
                  sourceConfig: workflow.sourceConfig,
                  executionConfig: workflow.script,
                },
              ]
            : [];
        }),
      );
      assertBrowserContextUsage(
        plan.setup
          ? inputs.find((input) => input.file === plan.setup)
          : undefined,
        inputs,
        plan.shareBrowserContext,
      );
    },
    publications(projects) {
      if (!plan) return [];
      const summary = plan.summary;
      const occurrences = projects.flatMap((prepared) =>
        prepared.sources.map((source) => {
          const documentId = createDocumentInvocationId(
            source.projectId,
            source.sourcePath,
            source.invocationIndex,
          );
          const workflow = workflows.get(documentId);
          return {
            file: source.absolutePath,
            projectId: prepared.project.projectId,
            documentId,
            reportEnabled: workflow
              ? isYamlReportEnabled(workflow.script)
              : false,
            artifacts: artifacts.get(documentId),
          };
        }),
      );
      return [
        {
          operation: 'write-result',
          path: summary,
          async publish(result) {
            if (compatibility.writeSummary !== false)
              await writeLegacyTestSummary(summary, result, occurrences);
          },
        },
      ];
    },
  };
}
