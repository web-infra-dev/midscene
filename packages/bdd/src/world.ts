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
  workerUiAgentSlot = new UiAgentSlot();
}

// ———————————————————————————— world ————————————————————————————

interface UiAgentState {
  agent: UiAgent;
  cleanup?: () => Promise<void>;
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

/**
 * One cached UI-agent slot: lazy creation with a shared in-flight promise,
 * retry after a failed creation, and teardown that awaits any in-flight
 * creation so the browser/device it launches never leaks. The same machine
 * serves both lifetimes — instantiated once at module level for
 * `scope: 'worker'` and once per World for the default scenario scope — so
 * their semantics cannot drift.
 */
class UiAgentSlot {
  private state?: UiAgentState;
  private promise?: Promise<UiAgentState>;

  async get(config: ResolvedBddConfig): Promise<UiAgentState> {
    if (this.state) {
      return this.state;
    }
    if (!this.promise) {
      this.promise = createUiAgent(config).then((created) => {
        this.state = created;
        return created;
      });
    }
    const promise = this.promise;
    try {
      return await promise;
    } catch (error) {
      // Compare before clearing: a retry may already have installed a fresh
      // in-flight creation that must not be discarded.
      if (this.promise === promise) {
        this.promise = undefined;
      }
      throw error;
    }
  }

  peek(): UiAgent | undefined {
    return this.state?.agent;
  }

  /**
   * Tear down the slot's agent (no-op when none was created). The report
   * path is captured BEFORE cleanup (teardown may clear it). Errors are
   * RETURNED, never thrown, so callers control surfacing.
   */
  async destroy(): Promise<{ reportFile?: string; errors: Error[] }> {
    if (this.promise) {
      try {
        // A creation may still be in flight (e.g. a timed-out step): wait
        // for it so the browser it launches does not leak.
        await this.promise;
      } catch {
        // Creation failed — there is nothing to clean up.
      }
    }
    const state = this.state;
    this.state = undefined;
    this.promise = undefined;
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
      errors.push(toError(error));
    }
    return { reportFile, errors };
  }
}

// ——————————————————————— worker-scoped UI agent ———————————————————————
//
// `uiAgent.scope: 'worker'` caches the agent here (module level = once per
// cucumber worker process) instead of per-World, so scenarios reuse one
// device/browser session. register.ts destroys it in AfterAll.

let workerUiAgentSlot = new UiAgentSlot();

function isWorkerScoped(config: ResolvedBddConfig): boolean {
  return (
    typeof config.uiAgent === 'object' && config.uiAgent.scope === 'worker'
  );
}

/**
 * Tear down the worker-scoped UI agent (no-op when none was created, or when
 * the config is scenario-scoped). Errors are RETURNED, never thrown, so the
 * AfterAll hook controls surfacing. (The shared report path is attached
 * per-scenario by the After hook, so it is not returned here.)
 */
export async function destroyWorkerUiAgent(): Promise<{ errors: Error[] }> {
  const { errors } = await workerUiAgentSlot.destroy();
  return { errors };
}

export class MidsceneWorld extends World {
  /** Stashed by the BeforeStep hook so the catch-all step can read it. */
  currentStep?: {
    pickleStep: PickleStep;
    pickle: Pickle;
    gherkinDocument: GherkinDocument;
  };

  private uiAgentSlot = new UiAgentSlot();
  private generalAgent?: GeneralAgent;

  /**
   * Lazily create (and cache) the UI agent in the slot matching the
   * configured scope. Concurrent callers share one in-flight creation; a
   * failed creation clears the slot so a later step can retry.
   */
  async getUiAgent(): Promise<UiAgent> {
    const config = getRuntime().config;
    const slot = isWorkerScoped(config) ? workerUiAgentSlot : this.uiAgentSlot;
    return (await slot.get(config)).agent;
  }

  /** The UI agent if it has already been created; never triggers creation. */
  peekUiAgent(): UiAgent | undefined {
    return isWorkerScoped(getRuntime().config)
      ? workerUiAgentSlot.peek()
      : this.uiAgentSlot.peek();
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
      // Worker scope: the UI agent outlives the scenario. Report the shared
      // (rolling) path so this scenario's cucumber report links to it.
      const reportFile = workerUiAgentSlot.peek()?.reportFile ?? undefined;
      const errors: Error[] = [];
      await this.disposeGeneralAgent(errors);
      return { reportFile, errors };
    }

    const { reportFile, errors } = await this.uiAgentSlot.destroy();
    await this.disposeGeneralAgent(errors);
    return { reportFile, errors };
  }

  private async disposeGeneralAgent(errors: Error[]): Promise<void> {
    const generalAgent = this.generalAgent;
    this.generalAgent = undefined;
    if (generalAgent?.dispose) {
      try {
        await generalAgent.dispose();
      } catch (error) {
        errors.push(toError(error));
      }
    }
  }
}

/** Combine destroyAgents() errors into the single Error the After hook throws. */
export function cleanupError(errors: Error[]): Error {
  const details = errors.map((error) => error.message).join('; ');
  return new Error(
    `${ERROR_PREFIX} Agent cleanup failed (${errors.length} error(s)): ${details}`,
  );
}
