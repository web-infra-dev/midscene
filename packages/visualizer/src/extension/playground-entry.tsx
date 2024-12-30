import queryString from 'query-string';

import type { WebUIContext } from '@midscene/web/utils';
import { ConfigProvider } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { globalThemeConfig } from '../component/color';
import { StaticPlayground } from '../component/playground-component';
import { setSideEffect } from '../init';
import type { WorkerResponseGetContext } from './utils';
import { sendToWorker } from './utils';
import type { WorkerRequestGetContext } from './utils';
import { workerMessageTypes } from './utils';

import './playground-entry.less';

setSideEffect();

const PlaygroundEntry = () => {
  // extension proxy agent
  const query = useMemo(
    () => queryString.parse(window.location.search),
    [window.location.search],
  );
  const cacheContextId = query.cache_context_id;
  const [context, setContext] = useState<WebUIContext | null>(null);

  useEffect(() => {
    if (!cacheContextId) {
      throw new Error('cacheContextId is required');
    }

    if (typeof cacheContextId !== 'string') {
      throw new Error('cacheContextId must be a string');
    }

    const retrieveContext = async () => {
      const { context } = await sendToWorker<
        WorkerRequestGetContext,
        WorkerResponseGetContext
      >(workerMessageTypes.GET_CONTEXT, {
        id: cacheContextId,
      });
      setContext(context);
    };
    retrieveContext().catch((e) => {
      console.error('Failed to init Playground agent', e);
    });
  }, [cacheContextId]);

  return (
    <ConfigProvider theme={globalThemeConfig()}>
      <StaticPlayground context={context} />
    </ConfigProvider>
  );
};

const element = document.getElementById('app');
const root = ReactDOM.createRoot(element!);
root.render(<PlaygroundEntry />);
