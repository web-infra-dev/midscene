import { SendOutlined } from '@ant-design/icons';
import type { UIContext } from '@midscene/core/.';
import { Button } from 'antd';
import { useEffect, useState } from 'react';

export const serverBase = 'http://localhost:5800';

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
  let invalidReason = '';
  if (!props?.context) {
    ifPlaygroundValid = false;
    invalidReason = 'No context';
  } else if (!serverValid) {
    ifPlaygroundValid = false;
    invalidReason = 'Cannot connect to playground server';
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
  return (
    <Button
      disabled={!ifPlaygroundValid}
      onClick={launchPlayground}
      icon={<SendOutlined />}
    >
      Send to Playground
    </Button>
  );
}
