import type { ConversationEntry } from '../../service-caller/types';

/** Project standard-planner narrative without changing stored/provider history. */
export function projectScrollRecoveryHistory(
  entries: ConversationEntry[],
): ConversationEntry[] {
  const snapshot = structuredClone(entries);
  for (const entry of snapshot) {
    const message =
      entry.type === 'input-message'
        ? entry.message
        : entry.output.type === 'chat-completion'
          ? entry.output.rawValue
          : undefined;
    if (!message) continue; // Opaque Responses output must remain intact.
    const projectText = (text: string) => {
      if (message.role === 'user') {
        return text.replace(
          /<execution_history>[\s\S]*?<\/execution_history>/g,
          '',
        );
      }
      if (message.role !== 'assistant') return text;
      const actionStart = text.indexOf('<action-type>');
      const prefix = actionStart < 0 ? text : text.slice(0, actionStart);
      return (
        prefix
          .replace(/<planning>[\s\S]*?<\/planning>/g, '')
          .replace(/<log>[\s\S]*?<\/log>/g, '') +
        (actionStart < 0 ? '' : text.slice(actionStart))
      );
    };
    if (typeof message.content === 'string')
      message.content = projectText(message.content);
    else if (Array.isArray(message.content)) {
      for (const part of message.content)
        if (part.type === 'text') part.text = projectText(part.text);
    }
  }
  return snapshot;
}
