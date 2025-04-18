import type { UIContext } from '@midscene/core';
import { overrideAIConfig } from '@midscene/core/env';
import {
  ContextPreview,
  Logo,
  type PlaygroundResult,
  PlaygroundResultView,
  PromptInput,
  type ReplayScriptsInfo,
  ServiceModeControl,
  allScriptsFromDump,
  requestPlaygroundServer,
  useEnvConfig,
  useServerValid,
} from '@midscene/visualizer';
import type { StaticPageAgent } from '@midscene/web/playground';
import { Form, message } from 'antd';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';

type ServiceModeType = 'Server' | 'In-Browser' | 'In-Browser-Extension';

const blankResult = {
  result: null,
  dump: null,
  reportHTML: null,
  error: null,
};
const ERROR_CODE_NOT_IMPLEMENTED_AS_DESIGNED = 'NOT_IMPLEMENTED_AS_DESIGNED';

export const serverBase = 'http://localhost:5800';

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
interface PlaygroundProps {
  getAgent: (forceSameTabNavigation?: boolean) => StaticPageAgent | null;
  hideLogo?: boolean;
  showContextPreview?: boolean;
  dryMode?: boolean;
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
  const [replayScriptsInfo, setReplayScriptsInfo] =
    useState<ReplayScriptsInfo | null>(null);
  const [replayCounter, setReplayCounter] = useState(0);

  // Form and environment configuration
  const [form] = Form.useForm();
  const { config, deepThink } = useEnvConfig();

  const currentAgentRef = useRef<any>(null);
  const currentRunningIdRef = useRef<string | null>(null);
  const interruptedFlagRef = useRef<Record<string, boolean>>({});

  // Environment configuration check
  const configAlreadySet = Object.keys(config || {}).length >= 1;
  const serverValid = useServerValid(serviceMode === 'Server');

  // Override AI configuration
  useEffect(() => {
    overrideAIConfig(config);
  }, [config]);

  // Initialize context preview
  useEffect(() => {
    if (uiContextPreview) return;
    if (!showContextPreview) return;

    getAgent()
      ?.getUIContext()
      .then((context: UIContext) => {
        setUiContextPreview(context);
      })
      .catch((e) => {
        message.error('Failed to get UI context');
        console.error(e);
      });
  }, [uiContextPreview, showContextPreview, getAgent]);

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

    const activeAgent = getAgent();
    const thisRunningId = Date.now().toString();
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
      if (serviceMode === 'Server') {
        const uiContext = await activeAgent?.getUIContext();
        result = await requestPlaygroundServer(
          uiContext!,
          value.type,
          value.prompt,
          {
            requestId: thisRunningId,
            deepThink,
          },
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
        } else if (value.type === 'aiTap') {
          result.result = await activeAgent?.aiTap(value.prompt, {
            deepThink,
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
    if (result?.dump) {
      const info = allScriptsFromDump(result.dump);
      setReplayScriptsInfo(info);
      setReplayCounter((c) => c + 1);
    } else {
      setReplayScriptsInfo(null);
    }
    console.log(`time taken: ${Date.now() - startTime}ms`);
  }, [form, getAgent, serviceMode, deepThink]);

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
          <ServiceModeControl
            serviceMode={serviceMode as 'Server' | 'In-Browser'}
          />
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

  // Horizontal mode rendering
  return (
    <div className="playground-container">
      <PanelGroup autoSaveId="playground-layout" direction="horizontal">
        <Panel
          defaultSize={32}
          maxSize={60}
          minSize={20}
          style={{ paddingRight: '24px' }}
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
