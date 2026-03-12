const hasNonEmptyValue = (value: string | undefined): boolean =>
  typeof value === 'string' && value.trim().length > 0;

export const hasAiModelConfig = (
  env: NodeJS.ProcessEnv = process.env,
): boolean => {
  const hasModelName = hasNonEmptyValue(env.MIDSCENE_MODEL_NAME);
  const hasProviderConfig =
    hasNonEmptyValue(env.MIDSCENE_MODEL_API_KEY) ||
    hasNonEmptyValue(env.OPENAI_API_KEY) ||
    hasNonEmptyValue(env.MIDSCENE_MODEL_BASE_URL) ||
    hasNonEmptyValue(env.OPENAI_BASE_URL) ||
    hasNonEmptyValue(env.MIDSCENE_MODEL_INIT_CONFIG_JSON) ||
    hasNonEmptyValue(env.MIDSCENE_OPENAI_INIT_CONFIG_JSON);

  return hasModelName && hasProviderConfig;
};

export const logSkippedAiTests = (
  runnerName: string,
  env: NodeJS.ProcessEnv = process.env,
): void => {
  if (hasAiModelConfig(env)) return;

  console.warn(
    `[midscene:${runnerName}] Skipping AI tests because model config is unavailable.`,
  );
};
