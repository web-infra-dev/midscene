import { PlayCircleOutlined, SendOutlined } from '@ant-design/icons';
import type { UIContext } from '@midscene/core/.';
import { Button, Drawer, Tooltip } from 'antd';
import { useEffect, useState } from 'react';
import { Playground, useStaticPageAgent } from './playground-component';
import { useEnvConfig } from './store';
import './open-in-playground.less';
import type { WebUIContext } from '@midscene/web/utils';

declare const __VERSION__: string;

export const serverBase = 'http://localhost:5800';

const errorMessageServerNotReady = `To debug the prompt together with this UI context, please follow the steps below:

1. Start the local playground server (Select one of the commands):
 a. npx midscene-playground  (Under the midscene project directory)
 b. npx --yes @midscene/web
2. Click this button again.
`;

const errorMessageNoContext = `
No context info found. 
Try to select another task.
`;

const checkServerStatus = async () => {
  try {
    const res = await fetch(`${serverBase}/status`);
    return res.status === 200;
  } catch (e) {
    return false;
  }
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
  const serverValid = useServerValid();
  const [context, setContext] = useState<UIContext | undefined>();
  const [contextLoadingCounter, setContextLoadingCounter] = useState(0);
  const [isDrawerVisible, setIsDrawerVisible] = useState(false);

  let ifPlaygroundValid = true;
  let invalidReason: React.ReactNode = '';
  if (!serverValid) {
    ifPlaygroundValid = false;
    invalidReason = errorMessageServerNotReady;
  } else if (!props?.context) {
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

  const agent = useStaticPageAgent(context as WebUIContext);

  return (
    <>
      <Button onClick={showPlayground} icon={<PlayCircleOutlined />}>
        Open in Playground
      </Button>
      <Drawer
        title={null}
        placement="right"
        onClose={handleClose}
        open={isDrawerVisible}
        width="90%"
        styles={{
          header: { display: 'none' },
        }}
        className="playground-drawer"
      >
        <Playground agent={agent} hideLogo={true} key={contextLoadingCounter} />
      </Drawer>
    </>
  );
}
