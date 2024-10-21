import { SendOutlined } from '@ant-design/icons';
import type { UIContext } from '@midscene/core/.';
import { Button, Tooltip } from 'antd';
import { useEffect, useState } from 'react';

declare const __VERSION__: string;

export const serverBase = 'http://localhost:5800';

const errorMessageServerNotReady = `To debug the prompt together with this UI context, please follow the steps below:

1. Start the local playground server (Select one of the commands):
 a. npx --yes --package=@midscene/web@${__VERSION__} midscene-playground
 b. npx midscene-playground  (Under the midscene project directory)
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

export const useServerValid = () => {
  const [serverValid, setServerValid] = useState(false);

  useEffect(() => {
    let interruptFlag = false;
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
  }, []);

  return serverValid;
};

export default function SendToPlayground(props?: { context?: UIContext }) {
  const serverValid = useServerValid();

  let ifPlaygroundValid = true;
  let invalidReason: React.ReactNode = '';
  if (!serverValid) {
    ifPlaygroundValid = false;
    invalidReason = errorMessageServerNotReady;
  } else if (!props?.context) {
    ifPlaygroundValid = false;
    invalidReason = errorMessageNoContext;
  }

  const launchPlayground = async () => {
    // post a form to server, use a new window to open the playground

    const res = await fetch(`${serverBase}/playground-with-context`, {
      method: 'POST',
      body: JSON.stringify({
        context: JSON.stringify(props?.context),
      }),
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'omit',
    });
    const data = await res.json();
    const location = data.location;
    window.open(`${serverBase}${location}`, '_blank');
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
        <Button disabled icon={<SendOutlined />}>
          Send to Playground
        </Button>
      </Tooltip>
    );
  }
  return (
    <Button onClick={launchPlayground} icon={<SendOutlined />}>
      Send to Playground
    </Button>
  );
}
