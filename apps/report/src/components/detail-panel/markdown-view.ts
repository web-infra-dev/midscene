type ExecutionMarkdown = {
  markdown: string;
  attachments: unknown[];
};

export type ExecutionMarkdownView =
  | ({ status: 'ready' } & ExecutionMarkdown)
  | { status: 'empty' }
  | { status: 'error'; errorMessage: string };

export function getExecutionMarkdownView(
  activeExecution: unknown,
  toMarkdown: (activeExecution: unknown) => ExecutionMarkdown,
): ExecutionMarkdownView {
  if (!activeExecution) {
    return { status: 'empty' };
  }

  try {
    return {
      status: 'ready',
      ...toMarkdown(activeExecution),
    };
  } catch (error) {
    console.warn('Failed to render markdown view', error);

    return {
      status: 'error',
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  }
}
