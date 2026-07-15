import { defineNode } from '@midscene/test';
import {
  type TestProjectDefinition,
  defineTestProject,
  loadTestProject,
} from '@midscene/test/config';

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
    root: './e2e',
    files: {
      include: ['workflows/**/*.{yaml,yml}'],
      exclude: ['workflows/**/*.draft.yaml'],
    },
    nodes: [requestNode],
    setupDocument({ env }) {
      return { baseURL: env.TEST_BASE_URL ?? 'https://example.com' };
    },
  });

void project;
void loadTestProject<ProjectContext>();

defineTestProject({
  nodes: [],
  files: {
    // @ts-expect-error files.include must be an array.
    include: 'workflows/*.yaml',
  },
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
