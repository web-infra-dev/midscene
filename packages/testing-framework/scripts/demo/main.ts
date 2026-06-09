/**
 * Narrated end-to-end demo of the POC: runs the login/checkout journey
 * through all three authoring modes — pure Gherkin, pure JS, and the bound
 * overlay — over the one shared flow-IR, printing each resolved prompt, the
 * variable table as it evolves, flow entry/exit, and verdicts.
 *
 * Offline by default (scripted fake agents, no model keys / no browser).
 * Pass `--live` to drive a real browser + model against the static shop in
 * example/demo-app (experimental; needs MIDSCENE_MODEL_* env vars).
 */
import { join } from 'node:path';
import {
  type CompiledFeature,
  type FlowRegistry,
  type ScenarioIR,
  type ScenarioRunEvent,
  type ScenarioRunResult,
  type UiAgentLike,
  compileFeatureFile,
  createFlowRegistry,
  runScenario,
} from '@midscene/testing-framework';
import {
  checkoutAsAdmin,
  registry as jsRegistry,
  promoBanner,
} from '../../example/flows/shop.flows';
import { bound } from '../../example/flows/shop.overlay';
import type { GeneralAgentAdapter } from '../../src/general-agent/types';
import { ScriptedGeneralAgent, ScriptedUiAgent } from './scripted-agents';

const FEATURE_FILE = join(__dirname, '../../example/flows/shop.feature');
const SCENARIO_NAMES = ['Checkout as admin', 'Promo banner is advisory'];

// —— tiny ANSI helpers (plain escapes; disabled via NO_COLOR) ——
const useColor = process.env.NO_COLOR === undefined;
const paint = (code: number) => (s: string) =>
  useColor ? `\u001b[${code}m${s}\u001b[0m` : s;
const bold = paint(1);
const dim = paint(2);
const red = paint(31);
const green = paint(32);
const yellow = paint(33);
const cyan = paint(36);
const magenta = paint(35);

interface AgentBundle {
  uiAgent: UiAgentLike;
  generalAgent: GeneralAgentAdapter;
  cleanup?: () => Promise<void>;
  describeState?: () => string;
}

type AgentFactory = () => Promise<AgentBundle>;

interface ScenarioOutcome {
  name: string;
  skipped: boolean;
  result?: ScenarioRunResult;
  /** Canonical event trace, used to prove cross-mode equivalence. */
  trace: string[];
}

interface ModeOutcome {
  label: string;
  scenarios: ScenarioOutcome[];
}

export async function main(argv: string[]): Promise<number> {
  const live = argv.includes('--live');
  const modeFilter = parseModeFilter(argv);
  if (live) {
    // Fail fast (and self-configure the codex app-server path) before any
    // mode banner is printed.
    const { ensureLiveModelEnv } = await import('./live');
    try {
      ensureLiveModelEnv();
    } catch (err) {
      console.error(red((err as Error).message));
      return 2;
    }
  }

  const agentFactory: AgentFactory = live
    ? (await import('./live')).createLiveBundle
    : async () => {
        const ui = new ScriptedUiAgent();
        return {
          uiAgent: ui,
          generalAgent: new ScriptedGeneralAgent(),
          describeState: () => ui.describeState(),
        };
      };

  console.log('');
  console.log(
    bold('Midscene testing-framework POC — three authoring modes, one flow-IR'),
  );
  console.log(
    dim(
      live
        ? 'LIVE mode: real UI agent + model against example/demo-app (experimental).'
        : 'Offline mode: scripted fake agents simulate the shop. No API keys, no browser.',
    ),
  );

  const gherkin = compileFeatureFile(FEATURE_FILE);
  const gherkinRegistry = createFlowRegistry(gherkin.flows);

  const modes: Array<{
    label: string;
    source: string;
    scenarios: ScenarioIR[];
    registry: FlowRegistry;
  }> = [
    {
      label: 'Pure Gherkin',
      source: 'example/flows/shop.feature → compileFeatureFile()',
      scenarios: pickScenarios(gherkin),
      registry: gherkinRegistry,
    },
    {
      label: 'Pure JS',
      source: 'example/flows/shop.flows.ts → defineFlow()/scenario()',
      scenarios: [checkoutAsAdmin, promoBanner],
      registry: jsRegistry,
    },
    {
      label: 'Bound overlay',
      source:
        'example/flows/shop.overlay.ts → bindFeature(shop.feature, overlay)',
      scenarios: pickScenarios(bound),
      registry: createFlowRegistry(bound.flows),
    },
  ];

  const selectedModes = modeFilter
    ? modes.filter((m) => m.label.toLowerCase().includes(modeFilter))
    : modes;
  if (selectedModes.length === 0) {
    console.error(red(`No mode matches --mode ${modeFilter}.`));
    return 2;
  }

  const outcomes: ModeOutcome[] = [];
  for (let i = 0; i < selectedModes.length; i++) {
    const mode = selectedModes[i];
    console.log('');
    console.log(
      bold(
        cyan(`━━━ Mode ${i + 1}/${selectedModes.length}: ${mode.label} ━━━`),
      ),
    );
    console.log(dim(`    ${mode.source}`));

    const scenarios: ScenarioOutcome[] = [];
    for (const scenario of mode.scenarios) {
      scenarios.push(await runOne(scenario, mode.registry, agentFactory));
    }
    outcomes.push({ label: mode.label, scenarios });
  }

  if (selectedModes.length === modes.length) {
    printComparison(outcomes, gherkin, live);
  }

  const failed = outcomes
    .flatMap((m) => m.scenarios)
    .some((s) => s.result?.status === 'failed');
  return failed ? 1 : 0;
}

/** `--mode gherkin|js|bound` runs a single mode (handy for live runs). */
function parseModeFilter(argv: string[]): string | undefined {
  const index = argv.indexOf('--mode');
  if (index === -1) return undefined;
  const value = argv[index + 1]?.toLowerCase();
  if (!value)
    throw new Error('demo: --mode requires a value (gherkin|js|bound)');
  return value === 'bound' ? 'overlay' : value;
}

function pickScenarios(compiled: CompiledFeature): ScenarioIR[] {
  return SCENARIO_NAMES.map((name) => {
    const found = compiled.scenarios.find((s) => s.name === name);
    if (!found) {
      throw new Error(`demo: scenario "${name}" not found in the feature.`);
    }
    return found;
  });
}

async function runOne(
  scenario: ScenarioIR,
  registry: FlowRegistry,
  agentFactory: AgentFactory,
): Promise<ScenarioOutcome> {
  console.log('');
  console.log(`  ${bold(`▶ Scenario: ${scenario.name}`)}`);

  if (scenario.config?.skip) {
    console.log(`    ${yellow('↷ skipped')} ${dim('(overlay config.skip)')}`);
    return { name: scenario.name, skipped: true, trace: [] };
  }

  const bundle = await agentFactory();
  const trace: string[] = [];
  try {
    const result = await runScenario({
      scenario,
      registry,
      uiAgent: bundle.uiAgent,
      generalAgent: bundle.generalAgent,
      onEvent: (event) => {
        narrate(event);
        trace.push(canonical(event));
      },
    });

    const vars = Object.entries(result.variables);
    if (vars.length > 0) {
      console.log(
        `    ${dim('final variables:')} ${vars
          .map(([k, v]) => `${magenta(`{${k}}`)}=${JSON.stringify(v)}`)
          .join(', ')}`,
      );
    }
    if (bundle.describeState) {
      console.log(`    ${dim(`simulated shop: ${bundle.describeState()}`)}`);
    }
    for (const warning of result.warnings) {
      console.log(`    ${yellow(`⚠ warning: ${warning}`)}`);
    }
    console.log(
      `    ${result.status === 'passed' ? green('✔ scenario passed') : red('✘ scenario failed')}`,
    );
    return { name: scenario.name, skipped: false, result, trace };
  } finally {
    await bundle.cleanup?.();
  }
}

// —— narration ——

function narrate(event: ScenarioRunEvent): void {
  const pad = `    ${'  '.repeat('depth' in event ? event.depth : 0)}`;
  switch (event.type) {
    case 'flowEnter':
      console.log(
        `${pad}${cyan(`→ flow ${event.flowName}(${formatArgs(event.args)})`)}`,
      );
      break;
    case 'flowExit':
      console.log(
        `${pad}${cyan(`← ${event.flowName} returned ${formatArgs(event.returns)}`)}`,
      );
      break;
    case 'stepStart': {
      const tag = nodeTag(event.node);
      const from = event.template
        ? dim(`   (template: ${JSON.stringify(event.template)})`)
        : '';
      console.log(`${pad}${tag} ${event.input}${from}`);
      break;
    }
    case 'varSet':
      if (event.source === 'return') break; // flowExit already shows it
      console.log(
        `${pad}  ${magenta(`{${event.name}}`)} = ${JSON.stringify(event.value)} ${dim(`(${event.source})`)}`,
      );
      break;
    case 'stepEnd': {
      const { result } = event;
      if (result.verdict) {
        const mark = result.verdict.pass
          ? green('✔ PASS')
          : result.status === 'warning'
            ? yellow('⚠ SOFT FAIL')
            : red('✘ FAIL');
        console.log(`${pad}  ${mark} ${dim(`— ${result.verdict.reason}`)}`);
      } else if (result.error) {
        console.log(`${pad}  ${red(`✘ error — ${result.error}`)}`);
      } else if (result.node === 'ui' && result.output?.text) {
        console.log(`${pad}  ${dim(`↳ ${result.output.text}`)}`);
      }
      break;
    }
  }
}

function nodeTag(node: string): string {
  const label = `[${node}]`.padEnd(9);
  switch (node) {
    case 'verify':
      return green(label);
    case 'soft':
      return yellow(label);
    case 'capture':
      return magenta(label);
    case 'flow':
      return cyan(label);
    default:
      return label;
  }
}

function formatArgs(args: Record<string, string>): string {
  const entries = Object.entries(args);
  if (entries.length === 0) return '';
  return entries.map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(', ');
}

/** Mode-independent fingerprint of an event, for cross-mode comparison. */
function canonical(event: ScenarioRunEvent): string {
  switch (event.type) {
    case 'stepStart':
      return `${event.node}@${event.depth}: ${event.input}`;
    case 'varSet':
      return `var {${event.name}}=${event.value} (${event.source})`;
    case 'flowEnter':
      return `enter ${event.flowName}(${formatArgs(event.args)})`;
    case 'flowExit':
      return `exit ${event.flowName}`;
    case 'stepEnd':
      return `end ${event.result.node}:${event.result.status}`;
  }
}

// —— final comparison ——

function printComparison(
  outcomes: ModeOutcome[],
  gherkin: CompiledFeature,
  live: boolean,
): void {
  const [gherkinMode, jsMode] = outcomes;

  console.log('');
  console.log(bold(cyan('━━━ Comparison: three modes, one IR ━━━')));

  // 1. Gherkin vs JS: identical traces prove the two front-ends compile to
  //    the same IR and drive the engine identically.
  console.log('');
  if (live) {
    console.log(
      dim(
        '  (live mode: traces include real model verdicts, which are nondeterministic — exact trace identity is only guaranteed offline)',
      ),
    );
  }
  for (let i = 0; i < SCENARIO_NAMES.length; i++) {
    const a = gherkinMode.scenarios[i];
    const b = jsMode.scenarios[i];
    const identical =
      a.trace.length === b.trace.length &&
      a.trace.every((line, j) => line === b.trace[j]);
    const outcome = identical
      ? green(`identical execution trace ✔ (${a.trace.length} events)`)
      : red('traces DIFFER ✘');
    console.log(`  Gherkin vs JS — "${SCENARIO_NAMES[i]}": ${outcome}`);
  }

  // 2. What the overlay changed, derived from the IR itself.
  console.log('');
  console.log(`  ${bold('Bound overlay vs pure Gherkin:')}`);
  for (const name of SCENARIO_NAMES) {
    const plain = gherkin.scenarios.find((s) => s.name === name);
    const overlaid = bound.scenarios.find((s) => s.name === name);
    if (!plain || !overlaid) continue;

    const fingerprint = (s: ScenarioIR) =>
      s.steps.map((step) =>
        step.kind === 'prompt'
          ? `[${step.node}] ${step.template}`
          : step.kind === 'capture'
            ? `[capture] ${step.template} → {${step.varName}}`
            : `[flow] ${step.flowName}`,
      );
    const before = fingerprint(plain);
    const after = fingerprint(overlaid);
    const removed = before.filter((l) => !after.includes(l));
    const added = after.filter((l) => !before.includes(l));
    const injectedVars = Object.keys(overlaid.vars ?? {}).filter(
      (k) => !(plain.vars && k in plain.vars),
    );

    if (
      removed.length === 0 &&
      added.length === 0 &&
      injectedVars.length === 0 &&
      !overlaid.config
    ) {
      console.log(`    "${name}": ${dim('untouched (pure Gherkin)')}`);
      continue;
    }
    console.log(`    "${name}":`);
    for (const line of removed) console.log(`      ${red(`- ${line}`)}`);
    for (const line of added) console.log(`      ${green(`+ ${line}`)}`);
    for (const k of injectedVars) {
      console.log(
        `      ${green(`+ injected var {${k}} = ${JSON.stringify(overlaid.vars?.[k])}`)}`,
      );
    }
    if (overlaid.config) {
      console.log(
        `      ${yellow(`~ config: ${JSON.stringify(overlaid.config)}`)}`,
      );
    }
  }

  // 3. Status summary.
  console.log('');
  console.log(`  ${bold('Run summary:')}`);
  for (const mode of outcomes) {
    const cells = mode.scenarios.map((s) => {
      if (s.skipped) return yellow(`${s.name}: skipped`);
      const status =
        s.result?.status === 'passed' ? green('passed') : red('failed');
      const warn =
        s.result && s.result.warnings.length > 0
          ? yellow(` (+${s.result.warnings.length} warning)`)
          : '';
      return `${s.name}: ${status}${warn}`;
    });
    console.log(`    ${mode.label.padEnd(14)} ${cells.join(dim('  |  '))}`);
  }
  console.log('');
  console.log(
    dim(
      '  (The login-matrix Scenario Outline runs too — omitted here for brevity; see example/flows/.)',
    ),
  );
  console.log('');
}
