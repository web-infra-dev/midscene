function formatHHMM(date: Date): string {
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${hh}${mm}`;
}

function normalizeProjectLabel(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return 'midscene-review';
  }

  return trimmed
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, '')
    .slice(0, 48);
}

export function buildMidsceneLangSmithProjectName(input: {
  title?: string | null;
  now?: Date;
}): string {
  const title = normalizeProjectLabel(input.title ?? '');
  const hhmm = formatHHMM(input.now ?? new Date());
  return `${title}-${hhmm}-review`;
}

export function applyMidsceneLangSmithEnv(input: {
  enabled: boolean;
  title?: string | null;
  now?: Date;
}): string | null {
  if (input.enabled) {
    const projectName = buildMidsceneLangSmithProjectName({
      title: input.title,
      now: input.now,
    });
    process.env.MIDSCENE_LANGSMITH_DEBUG = '1';
    if (!process.env.LANGCHAIN_API_KEY && !process.env.LANGSMITH_API_KEY) {
      throw new Error(
        'LangSmith review requires LANGSMITH_API_KEY or LANGCHAIN_API_KEY',
      );
    }
    process.env.LANGCHAIN_TRACING = 'true';
    process.env.LANGCHAIN_ENDPOINT = 'https://api.smith.langchain.com';
    process.env.LANGSMITH_PROJECT = projectName;
    return projectName;
  }

  process.env.LANGCHAIN_TRACING = 'false';
  process.env.LANGSMITH_TRACING = 'false';
  // biome-ignore lint/performance/noDelete: process.env requires deletion to unset a value.
  delete process.env.MIDSCENE_LANGSMITH_DEBUG;
  // biome-ignore lint/performance/noDelete: process.env requires deletion to unset a value.
  delete process.env.LANGSMITH_PROJECT;
  return null;
}
