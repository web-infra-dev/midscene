/**
 * Fakes for the POC unit tests. No browser, no model calls.
 *
 * - `FakeUiAgent` stands in for the Midscene UI Agent at the `runNode` /
 *   `runScenario` boundary (aiAct / aiAsk / aiString / screenshot).
 * - `FakeGeneralAgent` implements the swappable `GeneralAgentAdapter` used by
 *   verify / soft / agent nodes.
 *
 * Both record every call so tests can assert that `{var}` substitution
 * happened mechanically BEFORE the prompt reached the "model".
 */
import type {
  GeneralAgentAdapter,
  GeneralAgentInput,
  GeneralAgentResult,
} from '../../../src/general-agent/types';
import type { UiAgentLike } from '../../../src/types';

export class FakeUiAgent implements UiAgentLike {
  /** Instructions received by aiAct (ui nodes), post-substitution. */
  actCalls: string[] = [];
  /** Extraction prompts received by aiString (capture steps). */
  stringCalls: string[] = [];
  askCalls: string[] = [];

  private readonly stringResults: string[];

  constructor(stringResults: string[] = []) {
    this.stringResults = [...stringResults];
  }

  async aiAct(instruction: string): Promise<string> {
    this.actCalls.push(instruction);
    return `did: ${instruction}`;
  }

  async aiAsk(prompt: string): Promise<string> {
    this.askCalls.push(prompt);
    return 'ok';
  }

  async aiString(prompt: string): Promise<string> {
    this.stringCalls.push(prompt);
    const next = this.stringResults.shift();
    if (next === undefined) {
      throw new Error('FakeUiAgent: no scripted aiString result left.');
    }
    return next;
  }

  interface = {
    screenshotBase64: async () => 'data:image/png;base64,FAKE',
  };
}

export type GeneralAgentScript = (
  input: GeneralAgentInput,
) => GeneralAgentResult;

export class FakeGeneralAgent implements GeneralAgentAdapter {
  calls: GeneralAgentInput[] = [];

  constructor(
    private readonly script: GeneralAgentScript = () => ({
      text: 'looks good',
      verdict: { pass: true, reason: 'fake pass' },
    }),
  ) {}

  async run(input: GeneralAgentInput): Promise<GeneralAgentResult> {
    this.calls.push(input);
    return this.script(input);
  }
}
