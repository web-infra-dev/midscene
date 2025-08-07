import './App.less';

import { Alert, ConfigProvider, Empty } from 'antd';
import { useEffect, useRef, useState } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';

import { antiEscapeScriptTag } from '@midscene/shared/utils';
import { Logo, Player, globalThemeConfig } from '@midscene/visualizer';
import DetailPanel from './components/detail-panel';
import DetailSide from './components/detail-side';
import GlobalHoverPreview from './components/global-hover-preview';
import Sidebar from './components/sidebar';
import { type DumpStoreType, useExecutionDump } from './components/store';
import Timeline from './components/timeline';
import type {
  PlaywrightTaskAttributes,
  PlaywrightTasks,
  VisualizerProps,
} from './types';

let globalRenderCount = 1;

function Visualizer(props: VisualizerProps): JSX.Element {
  const { dumps } = props;

  const executionDump = useExecutionDump((store: DumpStoreType) => store.dump);
  const executionDumpLoadId = useExecutionDump(
    (store) => store._executionDumpLoadId,
  );

  const setReplayAllMode = useExecutionDump((store) => store.setReplayAllMode);
  const replayAllScripts = useExecutionDump(
    (store) => store.allExecutionAnimation,
  );
  const insightWidth = useExecutionDump((store) => store.insightWidth);
  const insightHeight = useExecutionDump((store) => store.insightHeight);
  const replayAllMode = useExecutionDump((store) => store.replayAllMode);
  const setGroupedDump = useExecutionDump((store) => store.setGroupedDump);
  const sdkVersion = useExecutionDump((store) => store.sdkVersion);
  const modelName = useExecutionDump((store) => store.modelName);
  const modelDescription = useExecutionDump((store) => store.modelDescription);
  const reset = useExecutionDump((store) => store.reset);
  const [mainLayoutChangeFlag, setMainLayoutChangeFlag] = useState(0);
  const mainLayoutChangedRef = useRef(false);
  const dump = useExecutionDump((store) => store.dump);
  const [proModeEnabled, setProModeEnabled] = useState(false);

  useEffect(() => {
    if (dumps?.[0]) {
      setGroupedDump(dumps[0].get(), dumps[0].attributes);
    }
    return () => {
      reset();
    };
  }, [dumps, reset, setGroupedDump]);

  useEffect(() => {
    let resizeThrottler = false;
    const onResize = () => {
      if (resizeThrottler) {
        return;
      }
      resizeThrottler = true;
      setTimeout(() => {
        resizeThrottler = false;
        setMainLayoutChangeFlag((prev) => prev + 1);
      }, 300);
    };
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
    };
  }, []);

  let mainContent: JSX.Element;
  if (dump && dump.executions.length === 0) {
    mainContent = (
      <div className="main-right">
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="There is no task info in this dump file."
        />
      </div>
    );
  } else if (!executionDump) {
    mainContent = (
      <div className="main-right">
        <div
          className="center-content"
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <Empty description="Loading report content..." />
        </div>
      </div>
    );
  } else {
    const content = replayAllMode ? (
      <div className="replay-all-mode-wrapper">
        <Player
          key={`${executionDumpLoadId}`}
          replayScripts={replayAllScripts!}
          imageWidth={insightWidth!}
          imageHeight={insightHeight!}
        />
      </div>
    ) : (
      <PanelGroup autoSaveId="page-detail-layout-v2" direction="horizontal">
        <Panel defaultSize={75} maxSize={95}>
          <div className="main-content-container">
            <DetailPanel />
          </div>
        </Panel>
        <PanelResizeHandle className="resize-handle" />
        <Panel maxSize={95}>
          <div className="main-side">
            <DetailSide />
          </div>
        </Panel>
      </PanelGroup>
    );

    mainContent = (
      <PanelGroup
        autoSaveId="main-page-layout"
        direction="horizontal"
        onLayout={() => {
          if (!mainLayoutChangedRef.current) {
            setMainLayoutChangeFlag((prev) => prev + 1);
          }
        }}
      >
        <Panel maxSize={95} defaultSize={25}>
          <div className="page-side">
            <Sidebar
              dumps={dumps}
              proModeEnabled={proModeEnabled}
              onProModeChange={setProModeEnabled}
              replayAllScripts={replayAllScripts}
              replayAllMode={replayAllMode}
              setReplayAllMode={setReplayAllMode}
            />
          </div>
        </Panel>
        <PanelResizeHandle
          className="resize-handle"
          onDragging={(isChanging) => {
            if (mainLayoutChangedRef.current && !isChanging) {
              setMainLayoutChangeFlag((prev) => prev + 1);
            }
            mainLayoutChangedRef.current = isChanging;
          }}
        />
        <Panel defaultSize={75} maxSize={95}>
          <div className="main-right">
            <div className="main-right-header">Record</div>
            <Timeline key={mainLayoutChangeFlag} />
            <div className="main-content">{content}</div>
          </div>
        </Panel>
      </PanelGroup>
    );
  }

  const [containerHeight, setContainerHeight] = useState('100%');
  useEffect(() => {
    const ifInRspressPage = document.querySelector('.rspress-nav');

    const navHeightKey = '--rp-nav-height';
    const originalNavHeight = getComputedStyle(
      document.documentElement,
    ).getPropertyValue(navHeightKey);

    if (ifInRspressPage) {
      const newNavHeight = '42px';
      setContainerHeight(`calc(100vh - ${newNavHeight})`);
      document.documentElement.style.setProperty(navHeightKey, newNavHeight);
    }

    return () => {
      if (ifInRspressPage) {
        document.documentElement.style.setProperty(
          navHeightKey,
          originalNavHeight,
        );
      }
    };
  }, []);

  useEffect(() => {
    return () => {
      globalRenderCount += 1;
    };
  }, []);

  return (
    <ConfigProvider theme={globalThemeConfig()}>
      <div
        className="page-container"
        key={`render-${globalRenderCount}`}
        style={{ height: containerHeight }}
      >
        <div className="page-nav">
          <div className="page-nav-left">
            <Logo />
          </div>
          <div className="page-nav-right">
            <div className="page-nav-version">
              v{sdkVersion}
              {modelName || modelDescription
                ? ` | ${[modelName, modelDescription]
                    .filter(Boolean)
                    .join(', ')}`
                : ''}
            </div>
          </div>
        </div>
        {mainContent}
      </div>
      <GlobalHoverPreview />
    </ConfigProvider>
  );
}

export function App() {
  function getDumpElements(): PlaywrightTasks[] {
    const dumpElements = document.querySelectorAll(
      'script[type="midscene_web_dump"]',
    );
    const reportDump: PlaywrightTasks[] = [];
    Array.from(dumpElements)
      .filter((el) => {
        const textContent = el.textContent;
        if (!textContent) {
          console.warn('empty content in script tag', el);
        }
        return !!textContent;
      })
      .forEach((el) => {
        const attributes: PlaywrightTaskAttributes = {
          playwright_test_name: '',
          playwright_test_description: '',
          playwright_test_id: '',
          playwright_test_title: '',
          playwright_test_status: '',
          playwright_test_duration: '',
        };
        Array.from(el.attributes).forEach((attr) => {
          const { name, value } = attr;
          const valueDecoded = decodeURIComponent(value);
          if (name.startsWith('playwright_')) {
            attributes[attr.name as keyof PlaywrightTaskAttributes] =
              valueDecoded;
          }
        });

        // Lazy loading: Store raw content and parse only when get() is called
        let cachedJsonContent: any = null;
        let isParsed = false;

        reportDump.push({
          get: () => {
            if (!isParsed) {
              try {
                console.time('parse_dump');
                const content = antiEscapeScriptTag(el.textContent || '');
                cachedJsonContent = JSON.parse(content);
                console.timeEnd('parse_dump');
                cachedJsonContent.attributes = attributes;
                isParsed = true;
              } catch (e) {
                console.error(el);
                console.error('failed to parse json content', e);
                // Return a fallback object to prevent crashes
                cachedJsonContent = {
                  attributes,
                  error: 'Failed to parse JSON content',
                };
                isParsed = true;
              }
            }
            return cachedJsonContent;
          },
          attributes: attributes,
        });
      });
    return reportDump;
  }

  const [reportDump, setReportDump] = useState<PlaywrightTasks[]>([]);
  const [error, setError] = useState<string | null>(null);

  const dumpsLoadedRef = useRef(false);

  useEffect(() => {
    // Check if document is already loaded

    const loadDumpElements = () => {
      const currentElements = document.querySelectorAll(
        'script[type="midscene_web_dump"]',
      );

      // If it has been loaded and the number of elements has not changed, skip it.
      if (
        dumpsLoadedRef.current &&
        currentElements.length === reportDump.length
      ) {
        return;
      }

      dumpsLoadedRef.current = true;
      if (
        currentElements.length === 1 &&
        currentElements[0].textContent?.trim() === ''
      ) {
        setError('There is no dump data to display.');
        setReportDump([]);
        return;
      }
      setError(null);
      const dumpElements = getDumpElements();
      setReportDump(dumpElements);
    };

    const loadDumps = () => {
      console.time('loading_dump');
      loadDumpElements();
      console.timeEnd('loading_dump');
    };

    // If DOM is already loaded (React mounts after DOMContentLoaded in most cases)
    if (
      document.readyState === 'complete' ||
      document.readyState === 'interactive'
    ) {
      // Use a small timeout to ensure all scripts are parsed
      setTimeout(loadDumps, 0);
    } else {
      // Wait for DOM content to be fully loaded
      document.addEventListener('DOMContentLoaded', loadDumps);
    }

    return () => {
      document.removeEventListener('DOMContentLoaded', loadDumps);
    };
  }, []);

  if (error) {
    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          padding: '100px',
          boxSizing: 'border-box',
        }}
      >
        <Alert
          message="Midscene.js - Error"
          description={error}
          type="error"
          showIcon
        />
      </div>
    );
  }
  return <Visualizer dumps={reportDump} />;
}
