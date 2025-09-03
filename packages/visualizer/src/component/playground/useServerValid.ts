import { PlaygroundSDK } from '@midscene/core/playground';
import { useEffect, useState } from 'react';
import { useEnvConfig } from '../store/store';

export const useServerValid = (shouldRun = true) => {
  const [serverValid, setServerValid] = useState(true);
  const { serviceMode } = useEnvConfig();

  useEffect(() => {
    let interruptFlag = false;
    if (!shouldRun) return;

    Promise.resolve(
      (async () => {
        while (!interruptFlag) {
          const playgroundSDK = new PlaygroundSDK({
            type: 'remote-execution',
          });
          const status = await playgroundSDK.checkStatus();
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
