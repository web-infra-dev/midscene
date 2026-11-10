type ConfigValue<T extends string = string> =
  | T
  | { value: T; comment?: string };

export type ModelPurpose = 'default' | 'locate' | 'planning' | 'insight';

export type ModelProtocol = 'openai-chat' | 'openai-responses';

/** Flat configuration for one provider, used to generate the env lines. */
export interface ModelConfig {
  baseUrl: ConfigValue;
  modelName: ConfigValue;
  modelFamily: ConfigValue;
  apiKey?: ConfigValue;
  protocol?: ConfigValue<ModelProtocol>;
  streamMode?: ConfigValue;
  /** Offer the Chat/Responses switch, optionally with a Responses-only Base URL. */
  responses?: boolean | { baseUrl: ConfigValue };
}

export interface ModelProvider
  extends Pick<ModelConfig, 'baseUrl' | 'modelName' | 'responses'> {
  name: string;
  /** Where to get an API key from this provider. */
  href?: string;
}

export interface ModelConfigCardProps
  extends Omit<ModelConfig, 'baseUrl' | 'modelName' | 'responses'> {
  layout?: 'select' | 'combined';
  purposes?: [ModelPurpose, ...ModelPurpose[]];
  providers: [ModelProvider, ...ModelProvider[]];
  /** OpenRouter model ID, e.g. `qwen/qwen3.7-plus`. Appends an OpenRouter provider. */
  openRouterModel?: string;
}

export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

export function getModelProviders(card: ModelConfigCardProps): ModelProvider[] {
  if (!card.openRouterModel) return card.providers;
  return [
    ...card.providers,
    {
      name: 'OpenRouter',
      href: 'https://openrouter.ai/settings/keys',
      baseUrl: OPENROUTER_BASE_URL,
      modelName: card.openRouterModel,
    },
  ];
}

export function resolveModelConfig(
  card: ModelConfigCardProps,
  provider: ModelProvider,
): ModelConfig {
  return {
    baseUrl: provider.baseUrl,
    modelName: provider.modelName,
    responses: provider.responses,
    modelFamily: card.modelFamily,
    apiKey: card.apiKey,
    protocol: card.protocol,
    streamMode: card.streamMode,
  };
}

export function buildCombinedModelConfigCode(
  config: ModelConfig,
  purposes: ModelPurpose[],
  selectedProtocol: ModelProtocol,
): string {
  return purposes
    .map(
      (purpose) =>
        `# ${purpose[0].toUpperCase()}${purpose.slice(1)}\n${buildModelConfigCode(config, purpose, selectedProtocol)}`,
    )
    .join('\n\n');
}

function formatConfigLine(name: string, config: ConfigValue): string {
  const { value, comment } =
    typeof config === 'string' ? { value: config } : config;
  const escapedValue = value.replace(/[\\"$`]/g, '\\$&');
  return `${name}="${escapedValue}"${comment ? ` # ${comment}` : ''}`;
}

export function buildModelConfigCode(
  config: ModelConfig,
  purpose: ModelPurpose,
  selectedProtocol: ModelProtocol,
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
      ? [formatConfigLine(`${prefix}_STREAM_MODE`, config.streamMode)]
      : []),
  ].join('\n');
}
