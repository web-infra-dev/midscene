/**
 * Shared contracts for @midscene/bdd.
 *
 * Every module implements against these types; see each module's header for
 * its exact export surface. Routing model (design doc): Midscene UI agent by
 * default; `# @agent` / `$skill` bails a single statement out to a general
 * coding agent; `# @no-ai` requires a classic user-registered callback.
 */
import type { GherkinDocument, Pickle } from '@cucumber/messages';

// ———————————————————————————— agents ————————————————————————————

/**
 * Structural view of the Midscene agent surface the router needs. A real
 * `PuppeteerAgent` (or any core `Agent`) satisfies this; tests use fakes.
 */
export interface UiAgent {
  aiAct(prompt: string): Promise<unknown>;
  aiAssert(
    assertion: string,
    errorMsg?: string,
    opt?: { keepRawResponse?: boolean },
  ): Promise<unknown>;
  /** Midscene HTML report path, when report generation is enabled. */
  reportFile?: string | null;
  interface?: {
    screenshotBase64?: () => Promise<string>;
  };
  destroy?(): Promise<void>;
}

export interface GeneralAgentRequest {
  /** 'assert' = Then-type step: a fail-closed verdict is REQUIRED. */
  kind: 'assert' | 'act';
  /** Fully resolved prompt (step text + any data table / doc string). */
  prompt: string;
  /** Skill documents referenced via $tokens, already loaded. */
  skills: Skill[];
  /** Current page screenshot, when a UI agent session already exists. */
  screenshotBase64?: string;
}

export interface GeneralAgentResult {
  text: string;
  /** Parsed verdict for 'assert' requests; absence is treated fail-closed. */
  verdict?: { pass: boolean; reason: string };
}

export interface GeneralAgent {
  run(request: GeneralAgentRequest): Promise<GeneralAgentResult>;
  dispose?(): Promise<void>;
}

// ———————————————————————————— config ————————————————————————————

export interface WebUiTarget {
  type: 'web';
  url: string;
  headed?: boolean;
  viewportWidth?: number;
  viewportHeight?: number;
  userAgent?: string;
}

export type UiAgentFactory = () => Promise<{
  agent: UiAgent;
  cleanup?: () => Promise<void>;
}>;

export interface GeneralAgentConfig {
  /**
   * General agent model env overrides (MIDSCENE_MODEL_* keys). Defaults to
   * process env; `MIDSCENE_MODEL_BASE_URL=codex://app-server` is supported.
   */
  modelEnv?: Record<string, string>;
  /** Escape hatch mirroring the uiAgent factory (e.g. for tests/custom agents). */
  factory?: () => Promise<GeneralAgent>;
}

export interface BddConfig {
  /** Web target (puppeteer launcher) or a user factory for any platform. */
  uiAgent: WebUiTarget | UiAgentFactory;
  generalAgent?: GeneralAgentConfig;
  paths?: {
    /** Feature globs, relative to the config dir. Default: ['features/**\/*.feature'] */
    features?: string[];
    /** Skills directory. Default: 'features/skills' */
    skills?: string;
  };
}

export interface ResolvedBddConfig {
  uiAgent: WebUiTarget | UiAgentFactory;
  generalAgent: GeneralAgentConfig;
  paths: { features: string[]; skills: string };
  /** Absolute directory the config file was loaded from (cwd fallback). */
  baseDir: string;
}

// ———————————————————————— annotations / routing ————————————————————————

/**
 * Step-level routing info resolved from `#` comment lines directly above the
 * step (Gherkin has no step-level tags) plus scenario/feature-level tags.
 */
export interface StepAnnotations {
  /** `# @agent` above the step, or any `$skill` token present. */
  agent: boolean;
  /** `# @no-ai` above the step, or `@no-ai` scenario/feature tag. */
  noAi: boolean;
  /** `# @soft` above the step, or `@soft` scenario/feature tag. */
  soft: boolean;
  /** `$skill-name` tokens from the step text and annotation comments. */
  skills: string[];
}

export type StepType = 'context' | 'action' | 'outcome' | 'unknown';

/**
 * Everything the router needs to execute one statement. Built by the
 * register hooks (top-level steps) and by the flow executor (flow steps).
 */
export interface RouterContext {
  /** Step text (flow-body steps arrive with `<param>` already substituted). */
  stepText: string;
  stepType: StepType;
  annotations: StepAnnotations;
  /** Rendered data table (markdown-ish text), when the step has one. */
  dataTable?: string;
  docString?: string;
  /** 0 at scenario level; flow calls increment. Cap: MAX_FLOW_DEPTH. */
  flowDepth: number;
  flows: FlowRegistryLike;
  skills: Map<string, Skill>;
  config: ResolvedBddConfig;
  /** Lazy: launching the browser only when a UI-routed step runs. */
  getUiAgent(): Promise<UiAgent>;
  /** Lazy: connecting the general agent only on @agent/$skill steps. */
  getGeneralAgent(): Promise<GeneralAgent>;
  /** UI agent if it has already been created (for screenshots); else undefined. */
  peekUiAgent(): UiAgent | undefined;
  /** cucumber attach passthrough (optional in tests). */
  attach?: (data: string, mediaType?: string) => void | Promise<void>;
  /** cucumber log passthrough (optional in tests). */
  log?: (text: string) => void | Promise<void>;
}

/** The router entry point; flows recurse through this. */
export type RunStepFn = (ctx: RouterContext) => Promise<void>;

// ———————————————————————————— flows ————————————————————————————

export const MAX_FLOW_DEPTH = 2;

export interface FlowDef {
  /** The scenario name — a cucumber expression (e.g. `I am logged in as {string}`). */
  name: string;
  /** `@param:x` tag names, in tag order; expression captures bind positionally. */
  params: string[];
  pickle: Pickle;
  document: GherkinDocument;
  uri: string;
}

export interface FlowMatch {
  flow: FlowDef;
  /** Param name -> captured value (already strings). */
  args: Record<string, string>;
}

/** Structural interface so router/world don't import the flows module. */
export interface FlowRegistryLike {
  /** Exactly-one match invokes; 2+ throws ambiguous; none -> undefined. */
  matchStep(text: string): FlowMatch | undefined;
  getByName(name: string): FlowDef | undefined;
  list(): FlowDef[];
}

// ———————————————————————————— no-ai ————————————————————————————

/**
 * Classic `@no-ai` callback. `this` is the step's {@link RouterContext}
 * (getUiAgent, attach, log, ...) — NOT the cucumber World instance.
 */
export type UserStepFn = (
  this: RouterContext,
  ...args: unknown[]
) => unknown | Promise<unknown>;

export interface UserStepDef {
  pattern: string | RegExp;
  fn: UserStepFn;
}

export interface UserStepMatch {
  def: UserStepDef;
  /** Captured arguments (cucumber-expression or regex groups), in order. */
  args: string[];
}

// ———————————————————————————— skills ————————————————————————————

export interface Skill {
  /** Token name, e.g. 'check-logs' for `$check-logs` / `skills/check-logs.md`. */
  name: string;
  content: string;
  file: string;
}

// ———————————————————————————— assets ————————————————————————————

export interface ScannedAssets {
  flows: FlowRegistryLike;
  /** Absolute feature file paths that were scanned. */
  files: string[];
}

// ———————————————————————————— misc ————————————————————————————

/** Message prefix for all errors and informational log lines. */
export const ERROR_PREFIX = '[midscene-bdd]';

/** Source pattern for flow param identifiers, shared by all modules. */
export const IDENT_RE_SOURCE = '[A-Za-z_][A-Za-z0-9_]*';
