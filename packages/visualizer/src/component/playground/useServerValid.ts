import { useEffect, useState } from 'react';
import { useEnvConfig } from '../store';
import { checkServerStatus } from './playground-utils';

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
