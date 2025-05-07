import { PlayCircleOutlined } from '@ant-design/icons';
import type { UIContext } from '@midscene/core';
import { Describer, useStaticPageAgent } from '@midscene/visualizer';
import type { WebUIContext } from '@midscene/web/utils';
import {
  Button,
  ConfigProvider,
  Drawer,
  Tabs,
  type TabsProps,
  Tooltip,
} from 'antd';
import { useEffect, useState } from 'react';
import { StandardPlayground } from './playground';
import { useEnvConfig } from './store';

import '@midscene/visualizer/index.css';

declare const __VERSION__: string;

export const serverBase = 'http://localhost:5800';

const errorMessageNoContext = `No context info found. 
Try to select another task like 'Locate'
`;

const checkServerStatus = async () => {
  try {
    const res = await fetch(`${serverBase}/status`);
    return res.status === 200;
  } catch (e) {
    return false;
  }
};

const tabKeys = {
  PLAYGROUND: 'playground',
  ELEMENT_DESCRIBER: 'element-describer',
};

export const useServerValid = (shouldRun = true) => {
  const [serverValid, setServerValid] = useState(false);
  const { serviceMode } = useEnvConfig();

  useEffect(() => {
    let interruptFlag = false;
    if (!shouldRun) return;
    Promise.resolve(
      (async () => {
        while (!interruptFlag) {
          const status = await checkServerStatus();
          if (status) {
            setServerValid(true);
          } else {
            setServerValid(false);
          }
          // sleep 1s
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      })(),
    );

    return () => {
      interruptFlag = true;
    };
  }, [serviceMode, shouldRun]);

  return serverValid;
};

export default function OpenInPlayground(props?: { context?: UIContext }) {
  const [context, setContext] = useState<UIContext | undefined>();
  const [contextLoadingCounter, setContextLoadingCounter] = useState(0);
  const [isDrawerVisible, setIsDrawerVisible] = useState(false);

  let ifPlaygroundValid = true;
  let invalidReason: React.ReactNode = '';
  if (!props?.context) {
    ifPlaygroundValid = false;
    invalidReason = errorMessageNoContext;
  }

  const showPlayground = () => {
    setContextLoadingCounter((c) => c + 1);
    setContext(props?.context || undefined);
    setIsDrawerVisible(true);
  };

  const handleClose = () => {
    setIsDrawerVisible(false);
  };
  const agent = useStaticPageAgent(context as WebUIContext);

  if (!ifPlaygroundValid) {
    return (
      <Tooltip
        title={
          <pre
            style={{
              whiteSpace: 'pre-wrap',
              wordWrap: 'break-word',
              margin: 0,
              padding: 0,
            }}
          >
            {invalidReason}
          </pre>
        }
        overlayInnerStyle={{ width: '380px' }}
      >
        <Button disabled icon={<PlayCircleOutlined />}>
          Open in Playground
        </Button>
      </Tooltip>
    );
  }

  const tabItems: TabsProps['items'] = [
    {
      key: tabKeys.PLAYGROUND,
      label: 'Playground',
    },
    ...(location.href.indexOf('beta') >= 0
      ? [
          {
            key: tabKeys.ELEMENT_DESCRIBER,
            label: 'Element Describer (Beta)',
          },
        ]
      : []),
  ];

  const [activeTab, setActiveTab] = useState(tabKeys.PLAYGROUND);

  let toolContent: React.ReactNode;
  if (activeTab === tabKeys.PLAYGROUND) {
    toolContent = (
      <StandardPlayground
        getAgent={() => {
          return agent;
        }}
        dryMode={true}
        hideLogo={true}
        key={contextLoadingCounter}
      />
    );
  } else if (activeTab === tabKeys.ELEMENT_DESCRIBER) {
    if (context) {
      toolContent = (
        <Describer uiContext={context} key={contextLoadingCounter} />
      );
    } else {
      toolContent = <div>No context found</div>;
    }
  }

  const tabComponent = (
    <ConfigProvider
      theme={{
        components: {
          Tabs: {
            horizontalMargin: '0 0 -1px 10px',
          },
        },
      }}
    >
      <Tabs
        defaultActiveKey={activeTab}
        items={tabItems}
        onChange={setActiveTab}
      />
    </ConfigProvider>
  );

  return (
    <>
      <Button onClick={showPlayground} icon={<PlayCircleOutlined />}>
        Open in Playground
      </Button>
      <Drawer
        title={tabComponent}
        placement="right"
        onClose={handleClose}
        open={isDrawerVisible}
        width="90%"
        styles={{
          header: { padding: '0 16px' },
          body: { padding: '24px' },
        }}
        className="playground-drawer"
      >
        {toolContent}
      </Drawer>
    </>
  );
}
