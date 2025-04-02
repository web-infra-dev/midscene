import { overrideAIConfig } from '@midscene/core/env';
import { Helmet } from '@modern-js/runtime/head';
import { Form, message } from 'antd';
import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { Logo } from '../logo';
import { allScriptsFromDump } from '../replay-scripts';
import type { ReplayScriptsInfo } from '../replay-scripts';
import { useEnvConfig } from '../store/store';
import { ContextPreview } from './ContextPreview';
import { PlaygroundResultView } from './PlaygroundResult';
import { PromptInput } from './PromptInput';
import { ServiceModeControl } from './ServiceModeControl';
import type {
  PlaygroundProps,
  PlaygroundResult,
  ServiceModeType,
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
import type { UIContext } from '@midscene/core';

// Utility function to determine if the run button should be enabled
function getRunButtonEnabled(
  serviceMode: ServiceModeType,
  getAgent: () => any | undefined,
  configAlreadySet: boolean,
  serverValid: boolean,
) {
  return (
    (serviceMode === 'In-Browser' && !!getAgent && configAlreadySet) ||
    (serviceMode === 'Server' && serverValid) ||
    (serviceMode === 'In-Browser-Extension' && !!getAgent && configAlreadySet)
  );
}

// Standard Playground Component (In-Browser and Server modes)
export function StandardPlayground({
  getAgent,
  hideLogo = false,
  showContextPreview = true,
  dryMode = false,
}: PlaygroundProps) {
  const { serviceMode } = useEnvConfig();
  // State management
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

  // Form and environment configuration
  const [form] = Form.useForm();
  const { config } = useEnvConfig();
  const forceSameTabNavigation = useEnvConfig(
    (state) => state.forceSameTabNavigation,
  );

  // References
  const runResultRef = useRef<HTMLHeadingElement>(null);
  const currentAgentRef = useRef<any>(null);
  const currentRunningIdRef = useRef<number | null>(0);
  const interruptedFlagRef = useRef<Record<number, boolean>>({});

  // Environment configuration check
  const configAlreadySet = Object.keys(config || {}).length >= 1;
  const serverValid = useServerValid(serviceMode === 'Server');

  // Responsive layout settings
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

  // Override AI configuration
  useEffect(() => {
    overrideAIConfig(config as any);
  }, [config]);

  // Initialize context preview
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

  // Handle form submission
  const handleRun = useCallback(async () => {
    const value = form.getFieldsValue();
    if (!value.prompt) {
      message.error('Prompt is required');
      return;
    }

    const startTime = Date.now();

    setLoading(true);
    setResult(null);
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
      if (serviceMode === 'In-Browser') {
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
  }, [form, getAgent, serviceMode, forceSameTabNavigation]);

  // Dummy handleStop for Standard mode (no real stopping functionality)
  const handleStop = async () => {
    // Empty implementation as standard modes don't have stop functionality
  };

  // Validate if it can run
  const runButtonEnabled = getRunButtonEnabled(
    serviceMode,
    getAgent,
    configAlreadySet,
    serverValid,
  );

  // Always false for standard modes
  const stoppable = false;

  // Get the currently selected type
  const selectedType = Form.useWatch('type', form);

  // Form section
  const formSection = (
    <Form form={form} onFinish={handleRun}>
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
          runButtonEnabled={runButtonEnabled}
          form={form}
          serviceMode={serviceMode}
          selectedType={selectedType}
          dryMode={dryMode}
          stoppable={stoppable}
          loading={loading}
          onRun={handleRun}
          onStop={handleStop}
        />
      </div>
    </Form>
  );

  // Vertical mode rendering
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

  // Horizontal mode rendering
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
          <Logo hideLogo={hideLogo} />
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
    <StandardPlayground
      getAgent={() => {
        return agent;
      }}
      dryMode={true}
    />
  );
}
