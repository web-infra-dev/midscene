import { PlayCircleOutlined } from '@ant-design/icons';
import type { UIContext } from '@midscene/core';
import { staticAgentFromContext } from '@midscene/visualizer';
import type { WebUIContext } from '@midscene/web';
import {
  Button,
  ConfigProvider,
  Drawer,
  Tabs,
  type TabsProps,
  Tooltip,
} from 'antd';
import { useState } from 'react';
import { StandardPlayground } from '../playground';

const errorMessageNoContext = `No context info found.
Try to select another task like 'Locate'
`;

const tabKeys = {
  PLAYGROUND: 'playground',
  ELEMENT_DESCRIBER: 'element-describer',
};

export default function OpenInPlayground(props?: { context?: UIContext }) {
  const [context, setContext] = useState<UIContext | undefined>();
  const [contextLoadingCounter, setContextLoadingCounter] = useState(0);
  const [isDrawerVisible, setIsDrawerVisible] = useState(false);
  // const { syncFromStorage } = useEnvConfig();

  let ifPlaygroundValid = true;
  let invalidReason: React.ReactNode = '';
  if (!props?.context) {
    ifPlaygroundValid = false;
    invalidReason = errorMessageNoContext;
  }

  // // Sync config from storage on component mount
  // useEffect(() => {
  //   syncFromStorage();
  // }, []); // Empty dependency array - only run once on mount

  const showPlayground = () => {
    setContextLoadingCounter((c) => c + 1);
    setContext(props?.context || undefined);
    setIsDrawerVisible(true);
  };

  const handleClose = () => {
    setIsDrawerVisible(false);
  };

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
          return staticAgentFromContext(context as WebUIContext);
        }}
        dryMode={true}
        hideLogo={true}
        key={contextLoadingCounter}
        canDownloadReport={false}
      />
    );
  } else if (activeTab === tabKeys.ELEMENT_DESCRIBER) {
    toolContent = <div>The component Describer was removed</div>;
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
