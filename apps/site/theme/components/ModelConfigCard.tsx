import { useLang } from '@rspress/core/runtime';
import { CodeBlockRuntime, Tab, Tabs } from '@rspress/core/theme';
import { useState } from 'react';
import {
  type ModelConfigCardProps,
  buildModelConfigCode,
} from './model-config-code';
import './ModelConfigTabs.css';

type ModelApiType = 'chat-completion' | 'responses';

type ModelConfigTabType = 'default' | 'planning' | 'insight';

const tabOrder: ModelConfigTabType[] = ['default', 'planning', 'insight'];

export function ModelConfigCard(props: ModelConfigCardProps) {
  const lang = useLang();
  const [apiType, setApiType] = useState<ModelApiType>('chat-completion');
  const helpText =
    lang === 'zh'
      ? '了解 Chat 和 Responses API 的区别'
      : 'Learn about Chat and Responses APIs';
  const helpHref = `${lang === 'zh' ? '/zh' : ''}/model-config#model-api-type`;

  const labels: Record<ModelConfigTabType, string> =
    lang === 'zh'
      ? {
          default: '🎯 用作默认模型',
          planning: '🧠 用作 Planning 模型',
          insight: '🔎 用作 Insight 模型',
        }
      : {
          default: '🎯 Use as default model',
          planning: '🧠 Use as Planning model',
          insight: '🔎 Use as Insight model',
        };

  return (
    <div className="model-config-tabs">
      {props.responses && (
        <fieldset
          className="model-api-selector"
          aria-label={lang === 'zh' ? 'API 类型' : 'API type'}
        >
          {(['chat-completion', 'responses'] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={apiType === value}
              onClick={() => setApiType(value)}
            >
              {value === 'responses' ? 'Responses' : 'Chat'}
            </button>
          ))}
          <a
            className="model-api-help"
            href={helpHref}
            aria-label={helpText}
            title={helpText}
          >
            ?
          </a>
        </fieldset>
      )}
      <Tabs defaultValue="default">
        {tabOrder.map((type) => (
          <Tab key={type} label={labels[type]} value={type}>
            <CodeBlockRuntime
              key={apiType}
              lang="bash"
              code={buildModelConfigCode(props, type, apiType)}
            />
          </Tab>
        ))}
      </Tabs>
    </div>
  );
}
