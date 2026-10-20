import type {
  NodeScopeTeardown,
  WorkflowDocumentRunResult,
} from './engine/types';
import type { WorkflowError } from './errors';
import type { NodeDefinition } from './node/types';

type Awaitable<T> = T | Promise<T>;

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  | JsonPrimitive
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

export interface TestFileSelection {
  include: readonly string[];
  exclude?: readonly string[];
}

export interface TestTagSelection {
  include?: readonly string[];
  exclude?: readonly string[];
}

export interface ExecutionProjectDefinition<TProjectContext = unknown> {
  name: string;
  setup?: ProjectSetupDefinition<TProjectContext>;
  /** Project-local Nodes override global Nodes with the same name. */
  nodes?: readonly NodeDefinition<any, any, TProjectContext>[];
  files?: TestFileSelection;
  tags?: TestTagSelection;
  retry?: number;
  variables?: Readonly<Record<string, JsonValue>>;
}

export interface ResolvedExecutionProject<TProjectContext = unknown> {
  readonly projectId: string;
  readonly name: string;
  readonly setup?: ProjectSetupDefinition<TProjectContext>;
  readonly files?: TestFileSelection;
  readonly tags: Readonly<Required<TestTagSelection>>;
  readonly retry: number;
  readonly variables: Readonly<Record<string, JsonValue>>;
}

/** The document kernel does not consume selection rules or host setup. */
export type WorkflowExecutionProject = Pick<
  ResolvedExecutionProject,
  'projectId' | 'name' | 'retry'
>;

export interface ProjectSetupContext<TProjectContext = unknown> {
  readonly project: ResolvedExecutionProject<TProjectContext>;
  readonly env: Readonly<NodeJS.ProcessEnv>;
  readonly signal: AbortSignal;
  onTeardown(teardown: ProjectTeardown<TProjectContext>): void;
}

export interface ProjectTeardownContext<TProjectContext = unknown> {
  readonly project: ResolvedExecutionProject<TProjectContext>;
  readonly context: TProjectContext | undefined;
  readonly status: 'success' | 'failed';
  readonly setupError?: WorkflowError;
}

export type ProjectTeardown<TProjectContext = unknown> = (
  ctx: ProjectTeardownContext<TProjectContext>,
) => Awaitable<void>;

export interface ProjectSetupDefinition<TProjectContext = unknown> {
  name: string;
  setup(ctx: ProjectSetupContext<TProjectContext>): Awaitable<TProjectContext>;
}

export interface DocumentSetupContext<TContext = unknown> {
  readonly project: WorkflowExecutionProject;
  readonly projectContext: TContext | undefined;
  readonly document: {
    readonly documentId: string;
    readonly documentRunId: string;
    readonly sourcePath: string;
    readonly attemptIndex: number;
  };
  readonly signal: AbortSignal;
  /** Runs after authored afterAll steps and Node teardowns, including failed setup. */
  onTeardown(teardown: NodeScopeTeardown): void;
}

export interface DocumentSetupDefinition<TContext = unknown> {
  name: string;
  setup(ctx: DocumentSetupContext<TContext>): Awaitable<TContext>;
  /** Publishes completed facts after resource cleanup; failure never retries actions. */
  onDocumentResult?(
    document: WorkflowDocumentRunResult,
    context: TContext | undefined,
  ): Awaitable<void>;
}
