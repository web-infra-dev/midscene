/**
 * Cucumber World and per-worker runtime singleton for @midscene/bdd.
 *
 * `MidsceneWorld` owns scenario-scoped state: the current pickle step
 * (stashed by the BeforeStep hook in register.ts) and lazily created
 * UI/general agents. The module-level `BddRuntime` singleton carries the
 * worker-wide config/flows/skills loaded once in BeforeAll.
 */
import { World } from '@cucumber/cucumber';
import type { GherkinDocument, Pickle, PickleStep } from '@cucumber/messages';
import { CallAiGeneralAgent } from './agents/general-agent';
import { createUiAgent } from './agents/ui-agent';
import {
  ERROR_PREFIX,
  type FlowRegistryLike,
  type GeneralAgent,
  type ResolvedBddConfig,
  type Skill,
  type UiAgent,
} from './types';

// ———————————————————————— per-worker runtime ————————————————————————

export interface BddRuntime {
  config: ResolvedBddConfig;
  flows: FlowRegistryLike;
  skills: Map<string, Skill>;
  /** Absolute feature paths scanned for flows; used to warn on divergence. */
  scannedFiles?: string[];
}

let runtime: BddRuntime | undefined;

export function setRuntime(rt: BddRuntime): void {
  runtime = rt;
}

export function getRuntime(): BddRuntime {
  if (!runtime) {
    throw new Error(
      `${ERROR_PREFIX} Runtime not initialized — is @midscene/bdd/register imported by cucumber?`,
    );
  }
  return runtime;
}

/** Test-only escape hatch. */
export function resetRuntime(): void {
  runtime = undefined;
  workerUiAgentState = undefined;
  workerUiAgentPromise = undefined;
}

// ———————————————————————————— world ————————————————————————————

interface UiAgentState {
  agent: UiAgent;
  cleanup?: () => Promise<void>;
}

// ——————————————————————— worker-scoped UI agent ———————————————————————
//
// `uiAgent.scope: 'worker'` caches the agent here (module level = once per
// cucumber worker process) instead of per-World, so scenarios reuse one
// device/browser session. register.ts destroys it in AfterAll.

let workerUiAgentState: UiAgentState | undefined;
let workerUiAgentPromise: Promise<UiAgentState> | undefined;

function isWorkerScoped(config: ResolvedBddConfig): boolean {
  return (
    typeof config.uiAgent === 'object' && config.uiAgent.scope === 'worker'
  );
}

/** Same retry semantics as the per-World path: a failed creation clears the
 * slot so a later scenario can retry. */
async function getWorkerUiAgentState(
  config: ResolvedBddConfig,
): Promise<UiAgentState> {
  if (workerUiAgentState) {
    return workerUiAgentState;
  }
  if (!workerUiAgentPromise) {
    workerUiAgentPromise = createUiAgent(config).then((created) => {
      workerUiAgentState = created;
      return created;
    });
  }
  try {
    return await workerUiAgentPromise;
  } catch (error) {
    workerUiAgentPromise = undefined;
    throw error;
  }
}

/**
 * Tear down the worker-scoped UI agent (no-op when none was created, or when
 * the config is scenario-scoped). Mirrors destroyAgents: errors are RETURNED,
 * never thrown, so the AfterAll hook controls surfacing.
 */
export async function destroyWorkerUiAgent(): Promise<{
  reportFile?: string;
  errors: Error[];
}> {
  if (workerUiAgentPromise) {
    try {
      await workerUiAgentPromise;
    } catch {
      // Creation failed — there is nothing to clean up.
    }
  }
  const state = workerUiAgentState;
  workerUiAgentState = undefined;
  workerUiAgentPromise = undefined;
  if (!state) {
    return { errors: [] };
  }

  const reportFile = state.agent.reportFile ?? undefined;
  const errors: Error[] = [];
  try {
    if (state.cleanup) {
      await state.cleanup();
    } else if (state.agent.destroy) {
      await state.agent.destroy();
    }
  } catch (error) {
    errors.push(error instanceof Error ? error : new Error(String(error)));
  }
  return { reportFile, errors };
}

export class MidsceneWorld extends World {
  /** Stashed by the BeforeStep hook so the catch-all step can read it. */
  currentStep?: {
    pickleStep: PickleStep;
    pickle: Pickle;
    gherkinDocument: GherkinDocument;
  };

  private uiAgentState?: UiAgentState;
  private uiAgentPromise?: Promise<UiAgentState>;
  private generalAgent?: GeneralAgent;

  /**
   * Lazily create (and cache) the UI agent. Concurrent callers share one
   * in-flight creation; a failed creation clears the slot so a later step
   * can retry.
   */
  async getUiAgent(): Promise<UiAgent> {
    const config = getRuntime().config;
    if (isWorkerScoped(config)) {
      const state = await getWorkerUiAgentState(config);
      return state.agent;
    }
    if (this.uiAgentState) {
      return this.uiAgentState.agent;
    }
    if (!this.uiAgentPromise) {
      this.uiAgentPromise = createUiAgent(getRuntime().config).then(
        (created) => {
          this.uiAgentState = created;
          return created;
        },
      );
    }
    try {
      const state = await this.uiAgentPromise;
      return state.agent;
    } catch (error) {
      this.uiAgentPromise = undefined;
      throw error;
    }
  }

  /** The UI agent if it has already been created; never triggers creation. */
  peekUiAgent(): UiAgent | undefined {
    if (isWorkerScoped(getRuntime().config)) {
      return workerUiAgentState?.agent;
    }
    return this.uiAgentState?.agent;
  }

  async getGeneralAgent(): Promise<GeneralAgent> {
    if (!this.generalAgent) {
      const generalConfig = getRuntime().config.generalAgent;
      this.generalAgent = generalConfig.factory
        ? await generalConfig.factory()
        : new CallAiGeneralAgent(generalConfig);
    }
    return this.generalAgent;
  }

  /**
   * Tear down both agents. The Midscene report path is captured BEFORE
   * cleanup (teardown may clear it). Every cleanup is attempted even when an
   * earlier one fails. Never throws: failures are RETURNED so the caller
   * can still use the report path before surfacing them (the After hook
   * attaches the report, then rethrows).
   *
   * Under `scope: 'worker'` the UI agent OUTLIVES the scenario: only the
   * general agent is torn down here, and the (shared) report path is still
   * returned so every scenario's cucumber report links to it. The worker
   * agent dies in AfterAll via destroyWorkerUiAgent().
   */
  async destroyAgents(): Promise<{ reportFile?: string; errors: Error[] }> {
    if (isWorkerScoped(getRuntime().config)) {
      return this.destroyScenarioAgentsKeepingWorkerUiAgent();
    }
    // A creation may still be in flight (e.g. a timed-out step): wait for it
    // so the browser it launches does not leak.
    if (this.uiAgentPromise) {
      try {
        await this.uiAgentPromise;
      } catch {
        // Creation failed — there is nothing to clean up.
      }
    }

    const uiState = this.uiAgentState;
    const generalAgent = this.generalAgent;
    this.uiAgentState = undefined;
    this.uiAgentPromise = undefined;
    this.generalAgent = undefined;

    const reportFile = uiState?.agent.reportFile ?? undefined;
    const errors: Error[] = [];
    const record = (error: unknown) => {
      errors.push(error instanceof Error ? error : new Error(String(error)));
    };

    if (uiState) {
      try {
        if (uiState.cleanup) {
          await uiState.cleanup();
        } else if (uiState.agent.destroy) {
          await uiState.agent.destroy();
        }
      } catch (error) {
        record(error);
      }
    }

    if (generalAgent?.dispose) {
      try {
        await generalAgent.dispose();
      } catch (error) {
        record(error);
      }
    }

    return { reportFile, errors };
  }

  private async destroyScenarioAgentsKeepingWorkerUiAgent(): Promise<{
    reportFile?: string;
    errors: Error[];
  }> {
    const generalAgent = this.generalAgent;
    this.generalAgent = undefined;

    const reportFile = workerUiAgentState?.agent.reportFile ?? undefined;
    const errors: Error[] = [];
    if (generalAgent?.dispose) {
      try {
        await generalAgent.dispose();
      } catch (error) {
        errors.push(error instanceof Error ? error : new Error(String(error)));
      }
    }
    return { reportFile, errors };
  }
}

/** Combine destroyAgents() errors into the single Error the After hook throws. */
export function cleanupError(errors: Error[]): Error {
  const details = errors.map((error) => error.message).join('; ');
  return new Error(
    `${ERROR_PREFIX} Agent cleanup failed (${errors.length} error(s)): ${details}`,
  );
}
