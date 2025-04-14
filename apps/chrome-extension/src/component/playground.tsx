import type { UIContext } from '@midscene/core';
import { overrideAIConfig } from '@midscene/core/env';
import {
  ContextPreview,
  EnvConfig,
  type PlaygroundResult,
  PlaygroundResultView,
  PromptInput,
  type ReplayScriptsInfo,
  useEnvConfig,
} from '@midscene/visualizer';
import { allScriptsFromDump } from '@midscene/visualizer';
import { Form, message } from 'antd';
import { useCallback, useEffect, useRef, useState } from 'react';

export interface PlaygroundProps {
  getAgent: (forceSameTabNavigation?: boolean) => any | null;
  showContextPreview?: boolean;
  dryMode?: boolean;
}

const ERROR_CODE_NOT_IMPLEMENTED_AS_DESIGNED = 'NOT_IMPLEMENTED_AS_DESIGNED';

const formatErrorMessage = (e: any): string => {
  const errorMessage = e?.message || '';
  if (errorMessage.includes('of different extension')) {
    return 'Conflicting extension detected. Please disable the suspicious plugins and refresh the page. Guide: https://midscenejs.com/quick-experience.html#faq';
  }
  if (!errorMessage?.includes(ERROR_CODE_NOT_IMPLEMENTED_AS_DESIGNED)) {
    return errorMessage;
  }
  return 'Unknown error';
};

// Blank result template
const blankResult = {
  result: null,
  dump: null,
  reportHTML: null,
  error: null,
};

// Browser Extension Playground Component
export function BrowserExtensionPlayground({
  getAgent,
  showContextPreview = true,
  dryMode = false,
}: PlaygroundProps) {
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
    overrideAIConfig(config);
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
      .catch((e: any) => {
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
    const result: PlaygroundResult = { ...blankResult };

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
      activeAgent.onTaskStartTip = (tip: string) => {
        if (interruptedFlagRef.current[thisRunningId]) {
          return;
        }
        setLoadingProgressText(tip);
      };

      // Extension mode always uses in-browser actions
      if (value.type === 'aiAction') {
        result.result = await activeAgent?.aiAction(value.prompt);
      } else if (value.type === 'aiQuery') {
        result.result = await activeAgent?.aiQuery(value.prompt);
      } else if (value.type === 'aiAssert') {
        result.result = await activeAgent?.aiAssert(value.prompt, undefined, {
          keepRawResponse: true,
        });
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
      // Extension mode specific processing
      result.dump = activeAgent?.dumpDataString()
        ? JSON.parse(activeAgent.dumpDataString())
        : null;

      result.reportHTML = activeAgent?.reportHTMLString() || null;
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
  }, [form, getAgent, forceSameTabNavigation]);

  // Handle stop running - extension specific functionality
  const handleStop = async () => {
    const thisRunningId = currentRunningIdRef.current;
    if (thisRunningId) {
      await currentAgentRef.current?.destroy();
      interruptedFlagRef.current[thisRunningId] = true;
      resetResult();
      console.log('destroy agent done');
    }
  };

  // Validate if it can run
  const runButtonEnabled = !!getAgent && configAlreadySet;

  // Check if it can be stopped - extension specific
  const stoppable = !dryMode && loading;

  // Get the currently selected type
  const selectedType = Form.useWatch('type', form);

  return (
    <div className="playground-container vertical-mode">
      <Form form={form} onFinish={handleRun} className="command-form">
        <div className="form-content">
          <div>
            <ContextPreview
              uiContextPreview={uiContextPreview}
              setUiContextPreview={setUiContextPreview}
              showContextPreview={showContextPreview}
            />

            <PromptInput
              runButtonEnabled={runButtonEnabled}
              form={form}
              serviceMode={'In-Browser-Extension'}
              selectedType={selectedType}
              dryMode={dryMode}
              stoppable={stoppable}
              loading={loading}
              onRun={handleRun}
              onStop={handleStop}
            />
          </div>
          <div className="form-part result-container">
            <PlaygroundResultView
              result={result}
              loading={loading}
              serviceMode={'In-Browser-Extension'}
              replayScriptsInfo={replayScriptsInfo}
              replayCounter={replayCounter}
              loadingProgressText={loadingProgressText}
              verticalMode={verticalMode}
            />
            <div ref={runResultRef} />
          </div>
        </div>
      </Form>
    </div>
  );
}
