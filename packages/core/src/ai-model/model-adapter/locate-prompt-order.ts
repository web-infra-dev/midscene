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

type UserGroup = { mode: 'userTogether' | 'userEach'; parts: Part[] };

export interface LocatePromptOrder {
  systemInstructions: boolean;
  userGroups: readonly UserGroup[];
}

export function parseLocatePromptOrder(
  order = 'system(instructions):userTogether(screenshot:task):userEach(references)',
): LocatePromptOrder {
  const groups = order.split(/(?<=\)):/);
  const systemInstructions = groups[0] === 'system(instructions)';
  const remaining = new Set<string>(parts);
  if (systemInstructions) {
    remaining.delete('instructions');
  }

  function invalid(reason: string): Error {
    return new Error(`Invalid locate promptOrder "${order}": ${reason}`);
  }

  const userGroups = groups
    .slice(systemInstructions ? 1 : 0)
    .map((group): UserGroup => {
      const match = /^(userTogether|userEach)\(([^()]+)\)$/.exec(group);
      if (!match) {
        throw invalid(
          `expected userTogether(...) or userEach(...), got "${group}"`,
        );
      }
      const groupParts = match[2].split(':');
      for (const part of groupParts) {
        if (!remaining.delete(part)) {
          throw invalid(`unknown or repeated part "${part}"`);
        }
      }
      return {
        mode: match[1] as UserGroup['mode'],
        parts: groupParts as Part[],
      };
    });
  if (remaining.size) {
    throw invalid(`missing ${[...remaining].join(', ')}`);
  }
  return { systemInstructions, userGroups };
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
  if (order.systemInstructions) {
    messages.push({ role: 'system', content: input.instructions });
  }

  for (const group of order.userGroups) {
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
