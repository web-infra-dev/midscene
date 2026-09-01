import type { TUserPrompt } from '@/ai-model';
import type { AiApiName } from '@midscene/shared/agent-tools/agent-context';

export type AIContextMetadata =
  | { source: 'default' }
  | { source: 'api'; apiName: AiApiName }
  | { source: 'call' };

export interface ResolvedAIContext {
  value: string;
  metadata: AIContextMetadata;
}

export const INTERNAL_AI_CONTEXT_METADATA_KEY =
  '_internalAIContextMetadata' as const;

export interface InternalAIContextOptions {
  [INTERNAL_AI_CONTEXT_METADATA_KEY]?: AIContextMetadata;
  /** Framework-owned workflow history appended after the selected context. */
  _internalAdditionalContext?: string;
}

export const resolvedAIContextFromOptions = (
  options:
    | ({ context?: string } & Partial<InternalAIContextOptions>)
    | undefined,
): ResolvedAIContext | undefined => {
  if (options?.context === undefined) {
    return undefined;
  }

  return {
    value: options.context,
    metadata: options[INTERNAL_AI_CONTEXT_METADATA_KEY] ?? { source: 'call' },
  };
};

/** Render the selected user context and framework history as separate blocks. */
export const renderAIContext = (
  resolvedContext: ResolvedAIContext | undefined,
  workflowHistory?: string,
): string | undefined => {
  const blocks: string[] = [];
  const context = resolvedContext?.value.trim();

  if (context && resolvedContext) {
    const metadata = resolvedContext.metadata;
    if (metadata.source === 'default') {
      blocks.push(`<GLOBAL_CONTEXT>\n${context}\n</GLOBAL_CONTEXT>`);
    } else {
      const apiAttribute =
        metadata.source === 'api' ? ` api="${metadata.apiName}"` : '';
      blocks.push(
        `<REQUEST_CONTEXT source="${metadata.source}"${apiAttribute}>\n${context}\n</REQUEST_CONTEXT>`,
      );
    }
  }

  const history = workflowHistory?.trim();
  if (history) {
    blocks.push(
      `<WORKFLOW_HISTORY read_only="true">\n${history}\n</WORKFLOW_HISTORY>`,
    );
  }

  if (blocks.length > 0) {
    return blocks.join('\n\n');
  }

  return resolvedContext !== undefined || workflowHistory !== undefined
    ? ''
    : undefined;
};

/** Explicitly concatenate context fragments in the order provided. */
export const mergeAIContexts = (
  ...contexts: Array<string | undefined>
): string | undefined => {
  const definedContexts = contexts.filter(
    (context): context is string => context !== undefined,
  );
  if (definedContexts.length === 0) {
    return undefined;
  }

  return definedContexts.filter(Boolean).join('\n\n');
};

export const buildPromptWithContext = (
  prompt: TUserPrompt,
  context: string | undefined,
): TUserPrompt => {
  const trimmedContext = context?.trim();
  if (!trimmedContext) {
    return prompt;
  }

  const promptText = typeof prompt === 'string' ? prompt : prompt.prompt;
  const promptWithContext = `${trimmedContext}\n\n${promptText}`;

  if (typeof prompt === 'string') {
    return promptWithContext;
  }

  return {
    ...prompt,
    prompt: promptWithContext,
  };
};

export const buildLocatePromptWithContext = (
  prompt: TUserPrompt,
  context: string | undefined,
  metadata?: AIContextMetadata,
): TUserPrompt => {
  const renderedContext = renderAIContext(
    context === undefined
      ? undefined
      : { value: context, metadata: metadata ?? { source: 'call' } },
  );
  if (!renderedContext) {
    return prompt;
  }

  const promptText = typeof prompt === 'string' ? prompt : prompt.prompt;
  const promptWithContext = `${renderedContext}\n\n<LOCATE_TARGET>\n${promptText}\n</LOCATE_TARGET>`;

  if (typeof prompt === 'string') {
    return promptWithContext;
  }

  return {
    ...prompt,
    prompt: promptWithContext,
  };
};
