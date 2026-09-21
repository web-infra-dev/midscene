import { useLang } from '@rspress/core/runtime';
import { Tab, Tabs } from '@rspress/core/theme';
import {
  Children,
  type ReactElement,
  type ReactNode,
  isValidElement,
} from 'react';

type ModelConfigTabType = 'default' | 'planning' | 'insight';

interface ModelConfigTabProps {
  type: ModelConfigTabType;
  children: ReactNode;
}

const tabOrder: ModelConfigTabType[] = ['default', 'planning', 'insight'];

export function ModelConfigTab({ children }: ModelConfigTabProps) {
  return children;
}

export function ModelConfigTabs({ children }: { children: ReactNode }) {
  const lang = useLang();
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

  const tabTypes = tabs.map((tab) => tab.props.type);
  if (!tabTypes.includes('default')) {
    throw new Error('ModelConfigTabs requires a default model configuration.');
  }

  if (new Set(tabTypes).size !== tabTypes.length) {
    throw new Error(
      'ModelConfigTabs does not allow duplicate configuration types.',
    );
  }

  return (
    <Tabs defaultValue="default">
      {tabOrder.map((type) => {
        const tab = tabs.find((item) => item.props.type === type);
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
  );
}
