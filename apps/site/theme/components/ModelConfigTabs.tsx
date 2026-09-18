import { useLang } from '@rspress/core/runtime';
import { Tab, Tabs } from '@rspress/core/theme';
import {
  Children,
  type ReactElement,
  type ReactNode,
  isValidElement,
  useState,
} from 'react';
import './ModelConfigTabs.css';

type ModelApiType = 'chat-completion' | 'responses';

type ModelConfigTabType = 'default' | 'planning' | 'insight';

interface ModelConfigTabProps {
  type: ModelConfigTabType;
  apiType?: ModelApiType;
  children: ReactNode;
}

const tabOrder: ModelConfigTabType[] = ['default', 'planning', 'insight'];

export function ModelConfigTab({ children }: ModelConfigTabProps) {
  return children;
}

export function ModelConfigTabs({ children }: { children: ReactNode }) {
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

  const tabs = Children.toArray(children).filter(
    (child): child is ReactElement<ModelConfigTabProps> =>
      isValidElement<ModelConfigTabProps>(child) &&
      child.type === ModelConfigTab,
  );

  const availableTabs = tabs.filter(
    (tab) => (tab.props.apiType ?? 'chat-completion') === apiType,
  );
  const tabTypes = availableTabs.map((tab) => tab.props.type);
  if (!tabTypes.includes('default')) {
    throw new Error('ModelConfigTabs requires a default model configuration.');
  }

  if (new Set(tabTypes).size !== tabTypes.length) {
    throw new Error(
      'ModelConfigTabs does not allow duplicate configuration types.',
    );
  }

  return (
    <div className="model-config-tabs">
      {tabs.some((tab) => tab.props.apiType === 'responses') && (
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
        {tabOrder.map((type) => {
          const tab = availableTabs.find((item) => item.props.type === type);
          if (!tab) {
            return null;
          }

          return (
            <Tab key={type} label={labels[type]} value={type}>
              {tab.props.children}
            </Tab>
          );
        })}
      </Tabs>
    </div>
  );
}
