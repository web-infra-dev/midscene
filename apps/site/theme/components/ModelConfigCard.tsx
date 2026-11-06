import { useLang } from '@rspress/core/runtime';
import { CodeBlockRuntime } from '@rspress/core/theme';
import { useId, useState } from 'react';
import {
  type ModelConfigCardProps,
  type ModelProtocol,
  type ModelPurpose,
  buildCombinedModelConfigCode,
  buildModelConfigCode,
  getModelProviders,
  resolveModelConfig,
} from './model-config-code';
import './ModelConfigCard.css';

const purposeOrder: ModelPurpose[] = [
  'default',
  'locate',
  'planning',
  'insight',
];

const copy = {
  en: {
    provider: 'Provider',
    getApiKey: 'Get API key',
    useAs: 'Use as',
    protocol: 'Protocol',
    protocolHelp: 'Learn about Chat and Responses APIs',
    purposeHelp: 'Learn about configuring models by intent',
    purposes: {
      default: 'Default model',
      locate: 'Locate model',
      planning: 'Planning model',
      insight: 'Insight model',
    },
  },
  zh: {
    provider: '供应商',
    getApiKey: '获取 API Key',
    useAs: '用作',
    protocol: '协议类型',
    protocolHelp: '了解 Chat 和 Responses API 的区别',
    purposeHelp: '了解如何按意图配置模型',
    purposes: {
      default: '默认模型',
      locate: '定位模型',
      planning: 'Planning 模型',
      insight: 'Insight 模型',
    },
  },
};

export function ModelConfigCard(props: ModelConfigCardProps) {
  const lang = useLang();
  const text = lang === 'zh' ? copy.zh : copy.en;
  const docPrefix = lang === 'zh' ? '/zh' : '';
  const purposeSelectId = useId();

  const providers = getModelProviders(props);
  const purposes = props.purposes ?? purposeOrder;
  const combined = props.layout === 'combined';

  const [providerIndex, setProviderIndex] = useState(0);
  const [purpose, setPurpose] = useState<ModelPurpose>(purposes[0]);
  const [selectedProtocol, setProtocol] =
    useState<ModelProtocol>('openai-chat');

  const provider = providers[providerIndex];
  const config = resolveModelConfig(props, provider);
  const showProtocolSwitch = Boolean(config.responses) && !config.protocol;
  // Providers without a Responses API always fall back to Chat.
  const protocol = showProtocolSwitch ? selectedProtocol : 'openai-chat';
  const code = combined
    ? buildCombinedModelConfigCode(config, purposes, protocol)
    : buildModelConfigCode(config, purpose, protocol);

  return (
    <div className="model-config-card">
      <div className="model-config-toolbar">
        <div className="model-config-toolbar-group">
          {providers.length > 1 ? (
            <fieldset className="model-config-segmented">
              <legend className="model-config-label">{text.provider}</legend>
              {providers.map((item, index) => (
                <button
                  key={item.name}
                  type="button"
                  aria-pressed={index === providerIndex}
                  onClick={() => setProviderIndex(index)}
                >
                  {item.name}
                </button>
              ))}
            </fieldset>
          ) : (
            <span className="model-config-provider-name">{provider.name}</span>
          )}
          {provider.href && (
            <a
              className="model-config-provider-link"
              href={provider.href}
              target="_blank"
              rel="noreferrer"
            >
              {text.getApiKey} ↗
            </a>
          )}
        </div>
        <div className="model-config-toolbar-group">
          {showProtocolSwitch && (
            <fieldset className="model-config-segmented">
              <legend className="model-config-visually-hidden">
                {text.protocol}
              </legend>
              {(['openai-chat', 'openai-responses'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={protocol === value}
                  onClick={() => setProtocol(value)}
                >
                  {value === 'openai-responses' ? 'Responses' : 'Chat'}
                </button>
              ))}
              <a
                className="model-config-help"
                href={`${docPrefix}/model-config#model-api-type`}
                aria-label={text.protocolHelp}
                title={text.protocolHelp}
              >
                ?
              </a>
            </fieldset>
          )}
          {!combined && purposes.length > 1 && (
            <span className="model-config-purpose">
              <label className="model-config-label" htmlFor={purposeSelectId}>
                {text.useAs}
              </label>
              <select
                id={purposeSelectId}
                value={purpose}
                onChange={(event) =>
                  setPurpose(event.target.value as ModelPurpose)
                }
              >
                {purposes.map((value) => (
                  <option key={value} value={value}>
                    {text.purposes[value]}
                  </option>
                ))}
              </select>
              <a
                className="model-config-help"
                href={`${docPrefix}/model-config#dedicated-models`}
                aria-label={text.purposeHelp}
                title={text.purposeHelp}
              >
                ?
              </a>
            </span>
          )}
        </div>
      </div>
      {/* Remount on change so the unhighlighted fallback never shows stale code. */}
      <CodeBlockRuntime key={code} lang="bash" code={code} wrapCode />
    </div>
  );
}
