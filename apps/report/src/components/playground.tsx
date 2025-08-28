import type { DeviceAction, UIContext } from '@midscene/core';
import { noReplayAPIs } from '@midscene/playground';
import type { PlaygroundAgent, StaticPageAgent } from '@midscene/playground';
import { overrideAIConfig } from '@midscene/shared/env';
import {
  ContextPreview,
  Logo,
  type PlaygroundResult,
  PlaygroundResultView,
  PromptInput,
  type ReplayScriptsInfo,
  ServiceModeControl,
  allScriptsFromDump,
  executeAction,
  formatErrorMessage,
  getActionSpace,
  requestPlaygroundServer,
  useEnvConfig,
  useServerValid,
} from '@midscene/visualizer';
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

export const serverBase = 'http://localhost:5800';

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
  const [actionSpace, setActionSpace] = useState<DeviceAction<any>[]>([]);
  const [actionSpaceLoading, setActionSpaceLoading] = useState(true);

  // Form and environment configuration
  const [form] = Form.useForm();
  const { config, deepThink, screenshotIncluded, domIncluded } = useEnvConfig();

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

  // Initialize actionSpace
  useEffect(() => {
    const loadActionSpace = async () => {
      setActionSpaceLoading(true);
      try {
        if (serviceMode === 'Server') {
          // For server mode, get from API with context
          const agent = getAgent();
          if (agent?.getUIContext) {
            const uiContext = await agent.getUIContext();
            const space = await getActionSpace(uiContext.toString());
            setActionSpace(space || []);
          } else {
            setActionSpace([]);
          }
        } else {
          // For in-browser mode, get from agent
          const agent = getAgent();
          if (agent?.getActionSpace) {
            const space = await agent.getActionSpace();
            setActionSpace(space || []);
          } else {
            setActionSpace([]);
          }
        }
      } catch (error) {
        console.error('Failed to load actionSpace:', error);
        setActionSpace([]);
      } finally {
        setActionSpaceLoading(false);
      }
    };

    loadActionSpace();
  }, [serviceMode, getAgent, serverValid, configAlreadySet]);

  // Handle form submission
  const handleRun = useCallback(async () => {
    const value = form.getFieldsValue();
    const { type, prompt, params } = value;

    // Dynamic validation using actionSpace like Chrome Extension
    const action = actionSpace?.find(
      (a: DeviceAction<any>) => a.interfaceAlias === type || a.name === type,
    );

    // Wait for actionSpace to load before validating
    if (actionSpaceLoading) {
      message.error('Loading action definitions, please wait...');
      return;
    }

    // Check if this action needs structured params (has paramSchema)
    const needsStructuredParams = !!action?.paramSchema;

    if (needsStructuredParams && !params) {
      message.error('Structured parameters are required for this action');
      return;
    } else if (!needsStructuredParams && !prompt) {
      message.error('Prompt is required');
      return;
    }

    const startTime = Date.now();

    setLoading(true);
    setResult(null);
    let result: PlaygroundResult = { ...blankResult };

    const activeAgent = getAgent();
    const thisRunningId = Date.now().toString();

    const actionType = value.type;
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
          actionType,
          value.prompt,
          {
            requestId: thisRunningId,
            deepThink,
            screenshotIncluded,
            domIncluded,
          },
        );
      } else {
        // Use the same executeAction logic as Chrome Extension for In-Browser mode
        result.result = await executeAction(
          activeAgent as unknown as PlaygroundAgent,
          actionType,
          actionSpace,
          value,
          {
            deepThink,
            screenshotIncluded,
            domIncluded,
          },
        );
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

    // Only generate replay info for interaction APIs, not for data extraction or validation APIs

    if (result?.dump && !noReplayAPIs.includes(actionType)) {
      const info = allScriptsFromDump(result.dump);
      setReplayScriptsInfo(info);
      setReplayCounter((c) => c + 1);
    } else {
      setReplayScriptsInfo(null);
    }
    console.log(`time taken: ${Date.now() - startTime}ms`);
  }, [form, getAgent, serviceMode, deepThink, actionSpace, actionSpaceLoading]);

  // Dummy handleStop for Standard mode (no real stopping functionality)
  const handleStop = async () => {
    // Empty implementation as standard modes don't have stop functionality
  };

  // Validate if it can run
  const runButtonEnabled =
    getRunButtonEnabled(serviceMode, getAgent, configAlreadySet, serverValid) &&
    !actionSpaceLoading;

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
          clearPromptAfterRun={false}
          actionSpace={actionSpace}
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
          <div
            className="playground-result-view-container"
            style={
              result
                ? {}
                : {
                    border: '1px solid #0000001f',
                    borderRadius: '8px',
                    height: '90vh',
                    padding: '16px',
                  }
            }
          >
            <PlaygroundResultView
              result={result}
              loading={loading}
              serverValid={serverValid}
              serviceMode={serviceMode}
              replayScriptsInfo={replayScriptsInfo}
              replayCounter={replayCounter}
              loadingProgressText={loadingProgressText}
            />
          </div>
        </Panel>
      </PanelGroup>
    </div>
  );
}
