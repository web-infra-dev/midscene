import './App.less';
import './index.less';

import { CaretRightOutlined } from '@ant-design/icons';
import { Button, ConfigProvider, Empty } from 'antd';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';

import { antiEscapeScriptTag } from '@midscene/shared/utils';
import { Logo, Player, globalThemeConfig } from '@midscene/visualizer';
import { PlaywrightCaseSelector } from './components/PlaywrightCaseSelector';
import DetailPanel from './components/detail-panel';
import DetailSide from './components/detail-side';
import GlobalHoverPreview from './components/global-hover-preview';
import Sidebar from './components/sidebar';
import { useExecutionDump } from './components/store';
import Timeline from './components/timeline';
import type {
  ExecutionDumpWithPlaywrightAttributes,
  StoreState,
  VisualizerProps,
} from './types';

let globalRenderCount = 1;

export function Visualizer(props: VisualizerProps): JSX.Element {
  const { dumps } = props;

  const executionDump = useExecutionDump((store: StoreState) => store.dump);
  const executionDumpLoadId = useExecutionDump(
    (store: StoreState) => store._executionDumpLoadId,
  );

  const setReplayAllMode = useExecutionDump(
    (store: StoreState) => store.setReplayAllMode,
  );
  const replayAllScripts = useExecutionDump(
    (store: StoreState) => store.allExecutionAnimation,
  );
  const insightWidth = useExecutionDump(
    (store: StoreState) => store.insightWidth,
  );
  const insightHeight = useExecutionDump(
    (store: StoreState) => store.insightHeight,
  );
  const replayAllMode = useExecutionDump(
    (store: StoreState) => store.replayAllMode,
  );
  const setGroupedDump = useExecutionDump(
    (store: StoreState) => store.setGroupedDump,
  );
  const reset = useExecutionDump((store: StoreState) => store.reset);
  const [mainLayoutChangeFlag, setMainLayoutChangeFlag] = useState(0);
  const mainLayoutChangedRef = useRef(false);
  const dump = useExecutionDump((store: StoreState) => store.dump);

  useEffect(() => {
    if (dumps) {
      setGroupedDump(dumps[0]);
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
        <PanelResizeHandle />
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
        <Panel maxSize={95} defaultSize={20}>
          <div className="page-side">
            <Sidebar />
          </div>
        </Panel>
        <PanelResizeHandle
          onDragging={(isChanging) => {
            if (mainLayoutChangedRef.current && !isChanging) {
              setMainLayoutChangeFlag((prev) => prev + 1);
            }
            mainLayoutChangedRef.current = isChanging;
          }}
        />
        <Panel defaultSize={80} maxSize={95}>
          <div className="main-right">
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
      {/* <Helmet>
        <title>Report - Midscene.js</title>
      </Helmet> */}
      <div
        className="page-container"
        key={`render-${globalRenderCount}`}
        style={{ height: containerHeight }}
      >
        <div className="page-nav">
          <div className="page-nav-left">
            <Logo />
            <div className="page-nav-toolbar">
              <ConfigProvider
                theme={{
                  components: {
                    Button: { textHoverBg: '#bfc4da80' },
                  },
                }}
              >
                <Button
                  type="text"
                  icon={<CaretRightOutlined />}
                  disabled={!replayAllScripts || replayAllScripts.length === 0}
                  style={{
                    background: replayAllMode ? '#bfc4da80' : undefined,
                  }}
                  onClick={() => {
                    setReplayAllMode(true);
                  }}
                >
                  Replay All
                </Button>
              </ConfigProvider>
            </div>
          </div>
          <PlaywrightCaseSelector
            dumps={props.dumps}
            selected={executionDump}
            onSelect={(dump) => {
              setGroupedDump(dump);
            }}
          />
        </div>
        {mainContent}
      </div>
      <GlobalHoverPreview />
    </ConfigProvider>
  );
}

// Main App component using Visualizer
const App = () => {
  const [reportDump, setReportDump] = useState<
    ExecutionDumpWithPlaywrightAttributes[]
  >([]);

  const loadDumpElements = useCallback(() => {
    console.log('[MidScene] loadDumpElements called');
    const dumpElements = document.querySelectorAll(
      'script[type="midscene_web_dump"]',
    );
    console.log(`[MidScene] Found ${dumpElements.length} dump elements`);
    const reportDump: ExecutionDumpWithPlaywrightAttributes[] = [];

    Array.from(dumpElements)
      .filter((el) => {
        const textContent = el.textContent;
        if (!textContent) {
          console.warn('empty content in script tag', el);
        }
        return !!textContent;
      })
      .forEach((el) => {
        const attributes: Record<string, any> = {};
        Array.from(el.attributes).forEach((attr) => {
          const { name, value } = attr;
          const valueDecoded = decodeURIComponent(value);
          if (name.startsWith('playwright_')) {
            attributes[attr.name] = valueDecoded;
          }
        });

        const content = antiEscapeScriptTag(el.textContent || '');
        try {
          const jsonContent = JSON.parse(content);
          jsonContent.attributes = attributes;
          reportDump.push(jsonContent);
        } catch (e) {
          console.error(el);
          console.error('failed to parse json content', e);
        }
      });

    setReportDump(reportDump);
  }, []);

  useEffect(() => {
    // 初始加载
    loadDumpElements();

    console.log('[MidScene] Setting up MutationObserver on document.body');
    // 创建MutationObserver来监听DOM变化
    const observer = new MutationObserver((mutations) => {
      console.log('[MidScene] MutationObserver triggered');
      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          const addedNodes = Array.from(mutation.addedNodes);
          const hasScriptTag = addedNodes.some((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const element = node as Element;
              // 检查是否是我们需要的script标签，或者包含这样的标签
              return (
                (element.tagName === 'SCRIPT' &&
                  element.getAttribute('type') === 'midscene_web_dump') ||
                element.querySelector('script[type="midscene_web_dump"]')
              );
            }
            return false;
          });

          if (hasScriptTag) {
            console.log(
              '[MidScene] Found midscene_web_dump script in mutation. Reloading dumps.',
            );
            // 稍微延迟一下，确保DOM完全更新
            setTimeout(loadDumpElements, 10);
          }
        }
      }
    });

    // 监听整个document body的变化
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    return () => {
      observer.disconnect();
    };
  }, [loadDumpElements]);

  return <Visualizer dumps={reportDump} />;
};

export default App;
