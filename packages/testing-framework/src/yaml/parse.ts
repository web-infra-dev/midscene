import yaml from 'js-yaml';
import { type FlowStep, type ParsedCase, isBuiltinNode } from './types';

/**
 * Parse a v2 case YAML string (RFC §1).
 *
 * Rules enforced here:
 *  - top-level has `flow` (ordered list) and optional `name`; no v1 `web:` /
 *    `android:` / `tasks:` environment fields.
 *  - each step is either a single-key map (`node: value`) or a bare string
 *    (a custom node with no input, e.g. `- notifySlack`).
 *  - built-in nodes (ui/verify/soft/agent) must take a string value.
 *  - custom nodes may take a string or an object.
 */
export function parseCaseYaml(source: string, file = '<inline>'): ParsedCase {
  let doc: unknown;
  try {
    doc = yaml.load(source);
  } catch (err) {
    throw new Error(
      `[midscene] Failed to parse YAML in ${file}: ${(err as Error).message}`,
    );
  }

  if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) {
    throw new Error(
      `[midscene] ${file}: a case file must be a mapping with a \`flow\` list.`,
    );
  }

  const record = doc as Record<string, unknown>;

  for (const legacy of [
    'web',
    'android',
    'ios',
    'computer',
    'tasks',
    'target',
  ]) {
    if (legacy in record) {
      throw new Error(
        `[midscene] ${file}: \`${legacy}\` is not allowed in a v2 case file. Environment and target belong in midscene.config.ts; the case only describes the flow.`,
      );
    }
  }

  const { name, flow } = record;

  if (name !== undefined && typeof name !== 'string') {
    throw new Error(`[midscene] ${file}: \`name\` must be a string.`);
  }

  if (!Array.isArray(flow)) {
    throw new Error(`[midscene] ${file}: \`flow\` must be a list of steps.`);
  }

  const steps: FlowStep[] = flow.map((raw, i) => parseStep(raw, i, file));

  if (steps.length === 0) {
    throw new Error(
      `[midscene] ${file}: \`flow\` must contain at least one step.`,
    );
  }

  return { name, flow: steps };
}

function parseStep(raw: unknown, index: number, file: string): FlowStep {
  const where = `${file}: flow[${index}]`;

  // Bare string step: a custom node name with no input (e.g. `- notifySlack`).
  if (typeof raw === 'string') {
    const node = raw.trim();
    if (!node) {
      throw new Error(`[midscene] ${where}: empty step.`);
    }
    if (isBuiltinNode(node)) {
      throw new Error(
        `[midscene] ${where}: built-in node \`${node}\` requires a natural-language instruction.`,
      );
    }
    return { node, input: undefined };
  }

  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(
      `[midscene] ${where}: a step must be a single-key mapping (\`node: value\`) or a bare node name.`,
    );
  }

  const keys = Object.keys(raw as Record<string, unknown>);
  if (keys.length !== 1) {
    throw new Error(
      `[midscene] ${where}: a step must have exactly one key (the node), got: ${keys.join(', ') || '(none)'}.`,
    );
  }

  const node = keys[0];
  const input = (raw as Record<string, unknown>)[node];

  if (isBuiltinNode(node)) {
    if (typeof input !== 'string') {
      throw new Error(
        `[midscene] ${where}: built-in node \`${node}\` must take a natural-language string, not ${describeType(input)}.`,
      );
    }
    if (!input.trim()) {
      throw new Error(`[midscene] ${where}: \`${node}\` instruction is empty.`);
    }
  }

  return { node, input };
}

function describeType(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'a list';
  return `a ${typeof value}`;
}
