type ConfigValue = string | { value: string; comment?: string };

export interface ModelConfigCardProps {
  baseUrl: ConfigValue;
  modelName: ConfigValue;
  modelFamily: ConfigValue;
  responses?: boolean | { baseUrl: ConfigValue };
}

function formatConfigLine(name: string, config: ConfigValue): string {
  const { value, comment } =
    typeof config === 'string' ? { value: config } : config;
  const escapedValue = value.replace(/[\\"$`]/g, '\\$&');
  return `${name}="${escapedValue}"${comment ? ` # ${comment}` : ''}`;
}

export function buildModelConfigCode(
  config: ModelConfigCardProps,
  purpose: 'default' | 'planning' | 'insight',
  protocol: 'openai-chat' | 'openai-responses',
): string {
  const prefix =
    purpose === 'default'
      ? 'MIDSCENE_MODEL'
      : `MIDSCENE_${purpose.toUpperCase()}_MODEL`;
  const baseUrl =
    protocol === 'openai-responses' && typeof config.responses === 'object'
      ? config.responses.baseUrl
      : config.baseUrl;

  return [
    ...(protocol === 'openai-responses'
      ? [formatConfigLine(`${prefix}_PROTOCOL`, 'openai-responses')]
      : []),
    formatConfigLine(`${prefix}_BASE_URL`, baseUrl),
    formatConfigLine(`${prefix}_API_KEY`, '......'),
    formatConfigLine(`${prefix}_NAME`, config.modelName),
    formatConfigLine(`${prefix}_FAMILY`, config.modelFamily),
  ].join('\n');
}
