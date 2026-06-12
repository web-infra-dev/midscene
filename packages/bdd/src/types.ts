/**
 * Shared contracts for @midscene/bdd.
 *
 * Every module implements against these types; see each module's header for
 * its exact export surface. Routing model (design doc): Midscene UI agent by
 * default; `# [agent]` / `$skill` bails a single statement out to a general
 * coding agent; `# [no-ai]` requires a classic user-registered callback.
 */
import type { GherkinDocument, Pickle } from '@cucumber/messages';
import type {
  AndroidDeviceOpt,
  HarmonyDeviceOpt,
  IOSDeviceOpt,
} from '@midscene/core/device';
import type { MidsceneYamlScriptAgentOpt } from '@midscene/core/yaml';

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

/**
 * Fields shared by every declarative target. `scope` lives on the target
 * (not at BddConfig level) because lifecycle is a property of what is being
 * driven: browsers are cheap to relaunch per scenario, physical devices are
 * not. Factory configs are always scenario-scoped.
 */
export interface UiTargetCommon {
  /**
   * Agent lifecycle. 'scenario' (default): fresh agent per scenario, full
   * isolation. 'worker': one agent per cucumber worker, reused across
   * scenarios and destroyed when the worker finishes (AfterAll).
   */
  scope?: 'scenario' | 'worker';
}

export interface WebUiTarget extends UiTargetCommon {
  type: 'web';
  url: string;
  headed?: boolean;
  viewportWidth?: number;
  viewportHeight?: number;
  userAgent?: string;
}

/** Field vocabulary mirrors the yaml `android:` env (deviceId, launch, ...). */
export interface AndroidUiTarget
  extends UiTargetCommon,
    // customActions is callback-typed (not config material); the resize
    // scale is deprecated-and-ignored in core — a new API has no reason to
    // accept either.
    Omit<AndroidDeviceOpt, 'customActions' | 'screenshotResizeScale'> {
  type: 'android';
  /** ADB device id; defaults to the first connected device. */
  deviceId?: string;
  /** URL or app package to launch after connecting (optional). */
  launch?: string;
}

/** Field vocabulary mirrors the yaml `ios:` env (deviceId, wdaPort, launch, ...). */
export interface IOSUiTarget
  extends UiTargetCommon,
    Omit<IOSDeviceOpt, 'customActions'> {
  type: 'ios';
  /** URL or app bundle id to launch after connecting (optional). */
  launch?: string;
}

/** Field vocabulary mirrors the yaml `harmony:` env (deviceId, launch, ...). */
export interface HarmonyUiTarget
  extends UiTargetCommon,
    Omit<HarmonyDeviceOpt, 'customActions' | 'screenshotResizeScale'> {
  type: 'harmony';
  /** HDC device id; defaults to the first connected device. */
  deviceId?: string;
  /** App package to launch after connecting (optional). */
  launch?: string;
  /** App-name → bundle-name mapping for launch, as in the yaml env. */
  appNameMapping?: Record<string, string>;
}

/** Field vocabulary mirrors the yaml `computer:` env. */
export interface ComputerUiTarget extends UiTargetCommon {
  type: 'computer';
  /** Display to drive; defaults to the primary display. */
  displayId?: string;
}

/**
 * Custom device: `const { [export] = default } = await import(module);
 * new DeviceClass(param)` wrapped with core's `createAgent`. Field vocabulary
 * mirrors the yaml `interface:` env. Relative module paths resolve against
 * the config file's directory.
 */
export interface InterfaceUiTarget extends UiTargetCommon {
  type: 'interface';
  module: string;
  export?: string;
  param?: Record<string, unknown>;
}

/** Every valid `uiAgent.type`, in the order documented in the README. */
export const UI_TARGET_TYPES = [
  'web',
  'android',
  'ios',
  'harmony',
  'computer',
  'interface',
] as const satisfies readonly UiTarget['type'][];

// Completeness tripwire: `satisfies` above rejects typos but not omissions —
// this fails to compile until a new union member is added to the array.
type MissingTargetTypes = Exclude<
  UiTarget['type'],
  (typeof UI_TARGET_TYPES)[number]
>;
const _allTargetTypesListed: MissingTargetTypes extends never ? true : never =
  true;
void _allTargetTypesListed;

/**
 * Declarative UI target — one flat object per platform, discriminated on
 * `type`. android/ios/harmony/computer need their optional peer package
 * (`@midscene/<type>`) installed.
 */
export type UiTarget =
  | WebUiTarget
  | AndroidUiTarget
  | IOSUiTarget
  | HarmonyUiTarget
  | ComputerUiTarget
  | InterfaceUiTarget;

/**
 * Agent construction options shared by every target type — mirrors the yaml
 * `agent:` block (generateReport, reportFileName, groupName, cache, ...).
 * `generateReport` defaults to true. (`testId` is a deprecated yaml alias a
 * new API has no reason to accept.)
 */
export type UiAgentOptions = Omit<MidsceneYamlScriptAgentOpt, 'testId'>;

export type UiAgentFactory = () => Promise<{
  agent: UiAgent;
  cleanup?: () => Promise<void>;
}>;

export interface GeneralAgentConfig {
  /** Which CLI coding agent runs `[agent]`/`$skill` steps. Default: 'opencode'. */
  type?: 'opencode' | 'codex';
  /**
   * Model override. opencode: 'provider/model', or a bare name mapped onto
   * the generated `midscene` provider. codex: passed as `-m`.
   * Default: the resolved MIDSCENE_MODEL_NAME.
   */
  model?: string;
  /** Extra env for the spawned CLI, merged over process.env. */
  env?: Record<string, string>;
  /** Working directory for the spawned CLI. Default: the config file's dir. */
  cwd?: string;
  /** Hard kill timeout per invocation. Default: 600_000 (10 min). */
  timeoutMs?: number;
  /**
   * What the agent may do in cwd: 'read-only' denies edits/shell writes,
   * 'workspace' (default) allows workspace writes, 'all' disables
   * sandboxing/permission prompts entirely (dangerous).
   */
  permissions?: 'read-only' | 'workspace' | 'all';
  /**
   * Reuse the Midscene model endpoint/key (MIDSCENE_MODEL_* env, legacy
   * OPENAI_* fallback) for the CLI agent. Default: true.
   */
  reuseMidsceneModelEnv?: boolean;
  /** Continue one CLI session across the steps of a scenario. Default: false. */
  sessionPerScenario?: boolean;
  /** Escape hatch mirroring the uiAgent factory (e.g. for tests/custom agents). */
  factory?: () => Promise<GeneralAgent>;
}

export interface BddConfig {
  /** Declarative platform target or a user factory for anything else. */
  uiAgent: UiTarget | UiAgentFactory;
  /** Options threaded into the agent constructor for every target type. */
  uiAgentOptions?: UiAgentOptions;
  generalAgent?: GeneralAgentConfig;
  paths?: {
    /** Feature globs, relative to the config dir. Default: ['features/**\/*.feature'] */
    features?: string[];
    /** Skills directory. Default: 'features/skills' */
    skills?: string;
  };
}

export interface ResolvedBddConfig {
  uiAgent: UiTarget | UiAgentFactory;
  uiAgentOptions?: UiAgentOptions;
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
  /** `# [agent]` above the step, or any `$skill` token present. */
  agent: boolean;
  /** `# [no-ai]` above the step, or `@no-ai` scenario/feature tag. */
  noAi: boolean;
  /** `# [soft]` above the step, or `@soft` scenario/feature tag. */
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
  /** Lazy: launching the browser only when a UI-routed step runs. */
  getUiAgent(): Promise<UiAgent>;
  /** Lazy: connecting the general agent only on [agent]/$skill steps. */
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
