/**
 * Cucumber World and per-worker runtime singleton for @midscene/bdd.
 *
 * `MidsceneWorld` owns scenario-scoped state: the variable table, the current
 * pickle step (stashed by the BeforeStep hook in register.ts), and lazily
 * created UI/general agents. The module-level `BddRuntime` singleton carries
 * the worker-wide config/flows/skills loaded once in BeforeAll.
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
  type VarScope,
} from './types';

// ———————————————————————— per-worker runtime ————————————————————————

export interface BddRuntime {
  config: ResolvedBddConfig;
  flows: FlowRegistryLike;
  skills: Map<string, Skill>;
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
}

// ———————————————————————————— world ————————————————————————————

interface UiAgentState {
  agent: UiAgent;
  cleanup?: () => Promise<void>;
}

export class MidsceneWorld extends World {
  /** Scenario-scoped variable table; reset by the Before hook. */
  vars: VarScope = new Map();
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
   * earlier one fails; failures are aggregated into one thrown Error.
   */
  async destroyAgents(): Promise<{ reportFile?: string }> {
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
    const errors: unknown[] = [];

    if (uiState) {
      try {
        if (uiState.cleanup) {
          await uiState.cleanup();
        } else if (uiState.agent.destroy) {
          await uiState.agent.destroy();
        }
      } catch (error) {
        errors.push(error);
      }
    }

    if (generalAgent?.dispose) {
      try {
        await generalAgent.dispose();
      } catch (error) {
        errors.push(error);
      }
    }

    if (errors.length > 0) {
      const details = errors
        .map((error) =>
          error instanceof Error ? error.message : String(error),
        )
        .join('; ');
      throw new Error(
        `${ERROR_PREFIX} Agent cleanup failed (${errors.length} error(s)): ${details}`,
      );
    }

    return { reportFile };
  }
}
