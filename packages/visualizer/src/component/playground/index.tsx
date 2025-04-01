import type { UIContext } from '@midscene/core';
import { overrideAIConfig } from '@midscene/core/env';
import { Helmet } from '@modern-js/runtime/head';
import { Form, message } from 'antd';
import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { Logo } from '../logo';
import { allScriptsFromDump } from '../replay-scripts';
import type { ReplayScriptsInfo } from '../replay-scripts';
import { useEnvConfig } from '../store';
import type { HistoryItem } from '../store';
import { ContextPreview } from './ContextPreview';
import { ControlPanel } from './ControlPanel';
import { PlaygroundResultView } from './PlaygroundResult';
import { PromptInput } from './PromptInput';
import { ServiceModeControl } from './ServiceModeControl';
import type {
  PlaygroundProps,
  PlaygroundResult,
  StaticPlaygroundProps,
} from './playground-types';
import {
  blankResult,
  formatErrorMessage,
  requestPlaygroundServer,
} from './playground-utils';
import { useServerValid } from './useServerValid';
import { useStaticPageAgent } from './useStaticPageAgent';
import './index.less';

export function Playground({
  getAgent,
  hideLogo = false,
  showContextPreview = true,
  dryMode = false,
}: PlaygroundProps) {
  // 状态管理
  const [uiContextPreview, setUiContextPreview] = useState<
    UIContext | undefined
  >(undefined);
  const [loading, setLoading] = useState(false);
  const [loadingProgressText, setLoadingProgressText] = useState('');
  const [result, setResult] = useState<PlaygroundResult | null>(null);
  const [verticalMode, setVerticalMode] = useState(false);
  const [replayScriptsInfo, setReplayScriptsInfo] =
    useState<ReplayScriptsInfo | null>(null);
  const [replayCounter, setReplayCounter] = useState(0);

  // 表单和环境配置
  const [form] = Form.useForm();
  const { config, serviceMode, setServiceMode } = useEnvConfig();
  const forceSameTabNavigation = useEnvConfig(
    (state) => state.forceSameTabNavigation,
  );
  const setForceSameTabNavigation = useEnvConfig(
    (state) => state.setForceSameTabNavigation,
  );
  const addHistory = useEnvConfig((state) => state.addHistory);
  const history = useEnvConfig((state) => state.history);
  const lastHistory = history[0];

  // 参照
  const runResultRef = useRef<HTMLHeadingElement>(null);
  const currentAgentRef = useRef<any>(null);
  const currentRunningIdRef = useRef<number | null>(0);
  const interruptedFlagRef = useRef<Record<number, boolean>>({});

  // 环境配置检查
  const configAlreadySet = Object.keys(config || {}).length >= 1;
  const serverValid = useServerValid(serviceMode === 'Server');

  // 响应式布局设置
  useEffect(() => {
    const sizeThreshold = 750;
    setVerticalMode(window.innerWidth < sizeThreshold);

    const handleResize = () => {
      setVerticalMode(window.innerWidth < sizeThreshold);
    };
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  // 覆盖AI配置
  useEffect(() => {
    overrideAIConfig(config as any);
  }, [config]);

  // 初始化上下文预览
  useEffect(() => {
    if (uiContextPreview) return;
    if (!showContextPreview) return;

    getAgent(forceSameTabNavigation)
      ?.getUIContext()
      .then((context: UIContext) => {
        setUiContextPreview(context);
      })
      .catch((e) => {
        message.error('Failed to get UI context');
        console.error(e);
      });
  }, [uiContextPreview, showContextPreview, getAgent, forceSameTabNavigation]);

  const resetResult = () => {
    setResult(null);
    setLoading(false);
    setReplayScriptsInfo(null);
  };

  // 处理表单提交
  const handleRun = useCallback(async () => {
    const value = form.getFieldsValue();
    if (!value.prompt) {
      message.error('Prompt is required');
      return;
    }

    const startTime = Date.now();

    setLoading(true);
    setResult(null);
    addHistory({
      type: value.type,
      prompt: value.prompt,
      timestamp: Date.now(),
    });
    let result: PlaygroundResult = { ...blankResult };

    const activeAgent = getAgent(forceSameTabNavigation);
    const thisRunningId = Date.now();
    try {
      if (!activeAgent) {
        throw new Error('No agent found');
      }
      currentAgentRef.current = activeAgent;

      currentRunningIdRef.current = thisRunningId;
      interruptedFlagRef.current[thisRunningId] = false;
      activeAgent.resetDump();
      activeAgent.opts.onTaskStartTip = (tip: string) => {
        if (interruptedFlagRef.current[thisRunningId]) {
          return;
        }
        setLoadingProgressText(tip);
      };
      if (serviceMode === 'Server') {
        const uiContext = await activeAgent?.getUIContext();
        result = await requestPlaygroundServer(
          uiContext!,
          value.type,
          value.prompt,
        );
      } else {
        if (value.type === 'aiAction') {
          result.result = await activeAgent?.aiAction(value.prompt);
        } else if (value.type === 'aiQuery') {
          result.result = await activeAgent?.aiQuery(value.prompt);
        } else if (value.type === 'aiAssert') {
          result.result = await activeAgent?.aiAssert(value.prompt, undefined, {
            keepRawResponse: true,
          });
        }
      }
    } catch (e: any) {
      result.error = formatErrorMessage(e);
      console.error(e);
    }

    if (interruptedFlagRef.current[thisRunningId]) {
      console.log('interrupted, result is', result);
      return;
    }

    try {
      if (
        serviceMode === 'In-Browser' ||
        serviceMode === 'In-Browser-Extension'
      ) {
        result.dump = activeAgent?.dumpDataString()
          ? JSON.parse(activeAgent.dumpDataString())
          : null;

        result.reportHTML = activeAgent?.reportHTMLString() || null;
      }
    } catch (e) {
      console.error(e);
    }

    try {
      console.log('destroy agent.page', activeAgent?.page);
      await activeAgent?.page?.destroy();
      console.log('destroy agent.page done', activeAgent?.page);
    } catch (e) {
      console.error(e);
    }

    currentAgentRef.current = null;
    setResult(result);
    setLoading(false);
    if (value.type === 'aiAction' && result?.dump) {
      const info = allScriptsFromDump(result.dump);
      setReplayScriptsInfo(info);
      setReplayCounter((c) => c + 1);
    } else {
      setReplayScriptsInfo(null);
    }
    console.log(`time taken: ${Date.now() - startTime}ms`);
  }, [form, getAgent, serviceMode, forceSameTabNavigation, addHistory]);

  // 处理停止运行
  const handleStop = async () => {
    const thisRunningId = currentRunningIdRef.current;
    if (thisRunningId) {
      await currentAgentRef.current?.destroy();
      interruptedFlagRef.current[thisRunningId] = true;
      resetResult();
      console.log('destroy agent done');
    }
  };

  // 按键事件处理
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && e.metaKey) {
      handleRun();
      e.preventDefault();
      e.stopPropagation();
    }
  };

  // 选择历史记录
  const handleSelectHistory = (historyItem: HistoryItem) => {
    form.setFieldsValue({
      prompt: historyItem.prompt,
      type: historyItem.type,
    });
  };

  // 获取初始表单值
  const historyInitialValues = useMemo(() => {
    return {
      type: lastHistory?.type || 'aiAction',
      prompt: lastHistory?.prompt || '',
    };
  }, [lastHistory]);

  // 验证是否可以运行
  const runButtonEnabled =
    (serviceMode === 'In-Browser' && !!getAgent && configAlreadySet) ||
    (serviceMode === 'Server' && serverValid) ||
    (serviceMode === 'In-Browser-Extension' && !!getAgent && configAlreadySet);

  // 是否可以停止
  const stoppable =
    !dryMode && serviceMode === 'In-Browser-Extension' && loading;

  // 获取当前选中的类型
  const selectedType = Form.useWatch('type', form);

  // 表单部分
  const formSection = (
    <Form
      form={form}
      onFinish={handleRun}
      initialValues={{ ...historyInitialValues }}
    >
      <div className="playground-form-container">
        <div className="form-part">
          <ServiceModeControl serviceMode={serviceMode} />
        </div>

        <ContextPreview
          uiContextPreview={uiContextPreview}
          setUiContextPreview={setUiContextPreview}
          showContextPreview={showContextPreview}
        />

        <PromptInput
          initialValues={historyInitialValues}
          runButtonEnabled={runButtonEnabled}
          onKeyDown={handleKeyDown}
          form={form}
        />

        <ControlPanel
          serviceMode={serviceMode}
          selectedType={selectedType}
          dryMode={dryMode}
          stoppable={stoppable}
          runButtonEnabled={runButtonEnabled}
          loading={loading}
          onRun={handleRun}
          onStop={handleStop}
          onSelectHistory={handleSelectHistory}
        />
      </div>
    </Form>
  );

  // Logo部分
  const logoComponent = !hideLogo && (
    <div className="playground-header">
      <Logo />
    </div>
  );

  // 垂直模式渲染
  if (verticalMode) {
    return (
      <div className="playground-container vertical-mode">
        {formSection}
        <div className="form-part">
          <PlaygroundResultView
            result={result}
            loading={loading}
            serverValid={serverValid}
            serviceMode={serviceMode}
            replayScriptsInfo={replayScriptsInfo}
            replayCounter={replayCounter}
            loadingProgressText={loadingProgressText}
            verticalMode={verticalMode}
          />
          <div ref={runResultRef} />
        </div>
      </div>
    );
  }

  // 水平模式渲染
  return (
    <div className="playground-container">
      <Helmet>
        <title>Playground - Midscene.js</title>
      </Helmet>
      <PanelGroup autoSaveId="playground-layout" direction="horizontal">
        <Panel
          defaultSize={32}
          maxSize={60}
          minSize={20}
          className="playground-left-panel"
        >
          {logoComponent}
          {formSection}
        </Panel>
        <PanelResizeHandle className="panel-resize-handle" />
        <Panel>
          <PlaygroundResultView
            result={result}
            loading={loading}
            serverValid={serverValid}
            serviceMode={serviceMode}
            replayScriptsInfo={replayScriptsInfo}
            replayCounter={replayCounter}
            loadingProgressText={loadingProgressText}
          />
        </Panel>
      </PanelGroup>
    </div>
  );
}

export function StaticPlayground({ context }: StaticPlaygroundProps) {
  const agent = useStaticPageAgent(context);
  return (
    <Playground
      getAgent={() => {
        return agent;
      }}
      dryMode={true}
    />
  );
}

export * from './playground-types';
export * from './useServerValid';
export * from './useStaticPageAgent';
export * from './playground-utils';

// 导出各个组件，便于单独使用
export { ServiceModeControl } from './ServiceModeControl';
export { ContextPreview } from './ContextPreview';
export { PromptInput } from './PromptInput';
export { ControlPanel } from './ControlPanel';
export { PlaygroundResultView } from './PlaygroundResult';
export { HistorySelector } from './HistorySelector';
export { ConfigSelector } from './ConfigSelector';
export { ActionButtons } from './ActionButtons';
