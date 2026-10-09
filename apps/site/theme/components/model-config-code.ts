type ConfigValue<T extends string = string> =
  | T
  | { value: T; comment?: string };

export interface ModelConfigCardProps {
  baseUrl: ConfigValue;
  modelName: ConfigValue;
  modelFamily: ConfigValue;
  apiKey?: ConfigValue;
  protocol?: ConfigValue<'openai-chat' | 'openai-responses'>;
  streamMode?: ConfigValue;
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
  selectedProtocol: 'openai-chat' | 'openai-responses',
): string {
  const protocolConfig = config.protocol ?? selectedProtocol;
  const protocol =
    typeof protocolConfig === 'string' ? protocolConfig : protocolConfig.value;
  const prefix =
    purpose === 'default'
      ? 'MIDSCENE_MODEL'
      : `MIDSCENE_${purpose.toUpperCase()}_MODEL`;
  const baseUrl =
    protocol === 'openai-responses' && typeof config.responses === 'object'
      ? config.responses.baseUrl
      : config.baseUrl;

  return [
    formatConfigLine(`${prefix}_BASE_URL`, baseUrl),
    formatConfigLine(`${prefix}_API_KEY`, config.apiKey ?? '......'),
    formatConfigLine(`${prefix}_NAME`, config.modelName),
    formatConfigLine(`${prefix}_FAMILY`, config.modelFamily),
    ...(protocol === 'openai-responses'
      ? [formatConfigLine(`${prefix}_PROTOCOL`, protocolConfig)]
      : []),
    ...(config.streamMode
      ? [formatConfigLine('MIDSCENE_MODEL_STREAM_MODE', config.streamMode)]
      : []),
  ].join('\n');
}
