import type {
  ConversationSystemMessage,
  ConversationUserMessage,
  MessageContent,
} from '../service-caller/types';

const parts = ['instructions', 'screenshot', 'task', 'references'] as const;
type Part = (typeof parts)[number];

export type LocateMessages = (
  | ConversationSystemMessage
  | ConversationUserMessage
)[];

type TextPart = Extract<Part, 'instructions' | 'task'>;
type PromptGroup =
  | { mode: 'system'; parts: TextPart[] }
  | { mode: 'userTogether' | 'userEach'; parts: Part[] };

export interface LocatePromptOrder {
  groups: readonly PromptGroup[];
}

export function parseLocatePromptOrder(
  order = 'system(instructions):userTogether(screenshot:task):userEach(references)',
): LocatePromptOrder {
  const groups = order.split(/(?<=\)):/);
  const remaining = new Set<string>(parts);

  function invalid(reason: string): Error {
    return new Error(`Invalid locate promptOrder "${order}": ${reason}`);
  }

  const promptGroups = groups.map((group): PromptGroup => {
    const match = /^(system|userTogether|userEach)\(([^()]+)\)$/.exec(group);
    if (!match) {
      throw invalid(
        `expected system(...), userTogether(...) or userEach(...), got "${group}"`,
      );
    }
    const groupParts = match[2].split(':');
    for (const part of groupParts) {
      if (!remaining.delete(part)) {
        throw invalid(`unknown or repeated part "${part}"`);
      }
      if (
        match[1] === 'system' &&
        (part === 'screenshot' || part === 'references')
      ) {
        throw invalid(`system cannot contain image part "${part}"`);
      }
    }
    if (match[1] === 'system') {
      return { mode: 'system', parts: groupParts as TextPart[] };
    }
    return {
      mode: match[1] as 'userTogether' | 'userEach',
      parts: groupParts as Part[],
    };
  });
  if (remaining.size) {
    throw invalid(`missing ${[...remaining].join(', ')}`);
  }
  return { groups: promptGroups };
}

export function buildLocateMessages(
  order: LocatePromptOrder,
  input: {
    instructions: string;
    screenshot: string;
    task: string;
    references: ConversationUserMessage[];
  },
): LocateMessages {
  const messages: LocateMessages = [];
  for (const group of order.groups) {
    if (group.mode === 'system') {
      messages.push({
        role: 'system',
        content: group.parts.map((part) => input[part]).join('\n\n'),
      });
      continue;
    }
    const expanded = group.parts.flatMap((part): ConversationUserMessage[] => {
      if (part === 'references') {
        return input.references;
      }
      const content =
        part === 'screenshot'
          ? [{ type: 'image' as const, url: input.screenshot }]
          : input[part];
      return [{ role: 'user', content }];
    });
    if (group.mode === 'userEach') {
      messages.push(...expanded);
    } else if (expanded.length) {
      const content = expanded.flatMap((message): MessageContent[] =>
        typeof message.content === 'string'
          ? [{ type: 'text', text: message.content }]
          : message.content,
      );
      messages.push({ role: 'user', content });
    }
  }
  return messages;
}
