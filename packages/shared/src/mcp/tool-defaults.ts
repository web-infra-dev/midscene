/**
 * Unified, declarative mechanism for "force a default option on every tool
 * call" behaviors exposed by MCP servers and the device / Agent Skill CLIs.
 *
 * Adding a new behavior flag (e.g. `--deep-search`) is a one-line change to
 * {@link TOOL_BEHAVIOR_FLAGS}: declare which default-option "bag" it fills.
 * The tool generator, servers, tools managers and CLI parsing are all generic
 * over {@link ToolDefaults} and never need to learn about individual flags.
 *
 * See https://github.com/web-infra-dev/midscene/issues/2446.
 */

/**
 * Default options injected into generated tool calls. Each field is an
 * injection point; an explicit per-call value always wins over these defaults.
 */
export interface ToolDefaults {
  /**
   * Merged into every locate field of action tools (`Tap`, `Input`, ...).
   * e.g. `{ deepLocate: true }`.
   */
  locate?: Record<string, unknown>;
  /**
   * Merged into the `act` tool's `aiAction` options.
   * e.g. `{ deepLocate: true, deepThink: true }`.
   */
  act?: Record<string, unknown>;
}

export interface ToolBehaviorFlag {
  /** Kebab-case CLI flag name, e.g. `deep-locate` (exposed as `--deep-locate`). */
  cli: string;
  /** One-line description for help output. */
  description: string;
  /** Default-option bags this flag turns on when present. */
  defaults: ToolDefaults;
}

/**
 * The single source of truth for behavior flags. Add a row to support a new
 * `--flag`; nothing else in the pipeline needs to change.
 */
export const TOOL_BEHAVIOR_FLAGS: readonly ToolBehaviorFlag[] = [
  {
    cli: 'deep-locate',
    description:
      'Force deep locate for every locating operation (better precision for small/ambiguous targets, a bit slower).',
    defaults: { locate: { deepLocate: true }, act: { deepLocate: true } },
  },
  {
    cli: 'deep-think',
    description:
      'Plan the act tool with deep thinking (richer context and sub-goal decomposition, a bit slower).',
    defaults: { act: { deepThink: true } },
  },
];

/** Merge two {@link ToolDefaults}, with `b` taking precedence over `a`. */
export function mergeToolDefaults(
  a: ToolDefaults,
  b: ToolDefaults,
): ToolDefaults {
  const locate = { ...a.locate, ...b.locate };
  const act = { ...a.act, ...b.act };
  const result: ToolDefaults = {};
  if (Object.keys(locate).length > 0) {
    result.locate = locate;
  }
  if (Object.keys(act).length > 0) {
    result.act = act;
  }
  return result;
}

/**
 * Resolve the active {@link ToolDefaults} from a predicate that says whether a
 * given flag (by its `cli` name) is enabled.
 */
export function resolveToolDefaults(
  isEnabled: (cli: string) => boolean,
): ToolDefaults {
  return TOOL_BEHAVIOR_FLAGS.reduce<ToolDefaults>(
    (acc, flag) =>
      isEnabled(flag.cli) ? mergeToolDefaults(acc, flag.defaults) : acc,
    {},
  );
}

/**
 * Split argv into the resolved {@link ToolDefaults} and the remaining args.
 *
 * Behavior flags (e.g. `--deep-locate`) are global: they may appear anywhere
 * in argv and are not tied to a specific sub-command. They are recognized by
 * exact kebab-case match — the same surface the MCP `parseArgs` config exposes
 * — and removed so a strict per-command parser never sees them. Every other
 * token is returned untouched and in order for that per-command parser.
 *
 * This is the single place that knows how a behavior flag looks on the command
 * line; both the device / Agent Skill CLI and the MCP launch path resolve their
 * defaults from {@link TOOL_BEHAVIOR_FLAGS} through here / {@link resolveToolDefaults}.
 */
export function stripBehaviorFlags(argv: readonly string[]): {
  rawArgs: string[];
  toolDefaults: ToolDefaults;
} {
  const enabled = new Set<string>();
  const rawArgs: string[] = [];
  for (const arg of argv) {
    const flag = TOOL_BEHAVIOR_FLAGS.find((f) => arg === `--${f.cli}`);
    if (flag) {
      enabled.add(flag.cli);
    } else {
      rawArgs.push(arg);
    }
  }
  return {
    rawArgs,
    toolDefaults: resolveToolDefaults((cli) => enabled.has(cli)),
  };
}
