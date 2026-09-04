export const AI_API_NAMES = [
  'aiAct',
  'aiTap',
  'aiRightClick',
  'aiDoubleClick',
  'aiHover',
  'aiInput',
  'aiKeyboardPress',
  'aiScroll',
  'aiPinch',
  'aiLongPress',
  'aiClearInput',
  'aiLocate',
  'aiQuery',
  'aiBoolean',
  'aiNumber',
  'aiString',
  'aiAsk',
  'aiAssert',
  'aiWaitFor',
] as const;

export type AiApiName = (typeof AI_API_NAMES)[number];

export const AGENT_AI_CONTEXT_KEYS = ['default', ...AI_API_NAMES] as const;

export type AgentAIContextKey = (typeof AGENT_AI_CONTEXT_KEYS)[number];

/**
 * Additional AI guidance configured at Agent level. Values may contain
 * business facts, decision or interaction rules, constraints, and output
 * requirements. An API-specific value overrides `default`; values are not
 * automatically merged.
 */
export type AgentAIContexts = {
  /**
   * Shared fallback for every AI-powered API. It is used only when neither
   * the current call nor the matching API key provides a context.
   */
  default?: string;
} & Partial<Record<AiApiName, string | undefined>>;

export const isAgentAIContextKey = (
  value: unknown,
): value is AgentAIContextKey =>
  typeof value === 'string' &&
  (AGENT_AI_CONTEXT_KEYS as readonly string[]).includes(value);
