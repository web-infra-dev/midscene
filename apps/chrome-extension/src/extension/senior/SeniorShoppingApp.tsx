import { useState, useEffect, useRef } from 'react';
import { Button, Input, Spin, message, Divider, Typography, Space, List, ConfigProvider } from 'antd';
import { AudioOutlined, SendOutlined, LoadingOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { ChromeExtensionProxyPage, ChromeExtensionProxyPageAgent } from '@midscene/web/chrome-extension';
import { regeneratePlanFromSummary, translateUserGoal } from '../../llm/translator';
import { Logo, globalThemeConfig, EnvConfig, useEnvConfig } from '@midscene/visualizer';
import { overrideAIConfig } from '@midscene/shared/env';
import './SeniorShoppingApp.less';

const { Text, Title } = Typography;
const { TextArea } = Input;

// UI phase states as defined in the PRD
enum Phase {
  Compose = 'compose',
  Preview = 'preview',
  Running = 'running',
  Outcome = 'outcome'
}

// Quick commands for common actions after automation
const quickCommands: Record<string, string | null> = {
  reviewCart: 'click "购物车"',
  continueShopping: null  // Explicitly null to show it's intentionally not performing an action
};

// Create extension agent for executing automation
const extensionAgentForTab = (forceSameTabNavigation = true) => {
  const page = new ChromeExtensionProxyPage(forceSameTabNavigation);
  return new ChromeExtensionProxyPageAgent(page);
};

interface TranslatorResponse {
  goal: string;
  midscene_prompt: string;
  summary: string[];
}

export const SeniorShoppingApp: React.FC<{}> = () => {
  // State management
  const [phase, setPhase] = useState<Phase>(Phase.Compose);
  const [userInput, setUserInput] = useState('');
  const [previousGoal, setPreviousGoal] = useState<string | null>(null);
  const [translatedGoal, setTranslatedGoal] = useState<TranslatorResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [goalId, setGoalId] = useState<string>('');
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [isListening, setIsListening] = useState(false);
  const [editedSummary, setEditedSummary] = useState<string[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const currentAgentRef = useRef<any>(null);

  // Track last keyboard input to prevent speech from overwriting it
  const lastKeyboardInputRef = useRef('');
  // Track if the last input was from keyboard 
  const isTypingRef = useRef(false);
  // Track current speech transcript
  const currentTranscriptRef = useRef('');

  const textAreaRef = useRef<any>(null);
  const speechRecognition = useRef<any>(null);

  // Get the current configuration from Midscene's store
  const { config } = useEnvConfig();

  // Ensure the configuration is applied when it changes
  useEffect(() => {
    overrideAIConfig(config);
  }, [config]);

  // Reset recognition on component unmount
  useEffect(() => {
    return () => {
      if (speechRecognition.current) {
        speechRecognition.current.stop();
      }
    };
  }, []);

  // Generate a unique goal ID when starting a new goal
  useEffect(() => {
    if (phase === Phase.Compose && !goalId) {
      setGoalId(`goal_${Date.now()}`);
    }
  }, [phase, goalId]);

  // Read aloud the summary if voice is enabled
  useEffect(() => {
    if (voiceEnabled && translatedGoal?.summary && phase === Phase.Preview) {
      const text = translatedGoal.summary.join('，');
      speakText(text);
    }
  }, [translatedGoal, phase, voiceEnabled]);

  // Simple logging function (no Supabase dependency)
  const logEvent = (eventType: string, data: Record<string, any> = {}) => {
    const event = {
      type: eventType,
      timestamp: new Date().toISOString(),
      goalId,
      ...data
    };

    console.log('📊 Study event:', event);

    // Store in localStorage for potential export later
    try {
      const logs = JSON.parse(localStorage.getItem('study_logs') || '[]');
      logs.push(event);
      localStorage.setItem('study_logs', JSON.stringify(logs));
    } catch (e) {
      console.warn('Failed to save log to localStorage:', e);
    }
  };

  // Handle keyboard input
  const handleKeyboardInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    setUserInput(text);
    lastKeyboardInputRef.current = text;
    isTypingRef.current = true;

    // Reset typing flag after a brief delay
    setTimeout(() => {
      isTypingRef.current = false;
    }, 300);
  };

  // Initialize speech recognition
  const initSpeechRecognition = () => {
    if (!('webkitSpeechRecognition' in window)) {
      message.error('语音识别不支持在此浏览器');
      return false;
    }

    const SpeechRecognition = (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'zh-CN'; // Default to Chinese for Taobao

    // Store starting text when recognition starts
    recognition.onstart = () => {
      // Save the current text as our starting point
      currentTranscriptRef.current = userInput;
    };

    recognition.onresult = (event: any) => {
      // Get the latest transcript
      const transcript = Array.from(event.results)
        .map((result: any) => result[0].transcript)
        .join('');

      // Only update if user hasn't typed recently
      if (!isTypingRef.current) {
        currentTranscriptRef.current = transcript;
        setUserInput(transcript);
      } else {
        // If user is typing, store speech separately but don't update UI
        currentTranscriptRef.current = transcript;
      }
    };

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error', event);
      setIsListening(false);

      // Handle specific error types
      if (event.error === 'not-allowed') {
        message.error('麦克风权限被拒绝，请在浏览器设置中允许访问麦克风');
      } else if (event.error === 'audio-capture') {
        message.error('找不到麦克风设备');
      } else if (event.error === 'network') {
        message.error('网络连接问题');
      } else {
        message.error('语音识别出错，请尝试文字输入');
      }
    };

    recognition.onend = () => {
      // Only if we're still supposed to be listening
      if (isListening) {
        // Try to restart
        try {
          recognition.start();
        } catch (e) {
          console.error('Failed to restart speech recognition:', e);
          setIsListening(false);
        }
      } else {
        setIsListening(false);
      }
    };

    speechRecognition.current = recognition;
    return true;
  };

  const toggleListening = async () => {
    if (!('webkitSpeechRecognition' in window)) {
      message.error('当前浏览器不支持语音识别');
      return;
    }

    // Ask Chrome if the mic is already blocked
    try {
      const { state } = await navigator.permissions.query({
        name: 'microphone' as PermissionName,
      });
      if (state === 'denied') {
        message.error('麦克风被禁用：请点地址栏右侧图标改为"允许"');
        return;
      }
    } catch (e) {
      console.error('Error checking microphone permissions:', e);
    }

    // Create recogniser on-demand
    if (!speechRecognition.current && !initSpeechRecognition()) return;

    // Toggle start/stop
    if (isListening) {
      // Stopping speech recognition
      try {
        speechRecognition.current.stop();
      } catch (e) {
        console.error('Error stopping speech recognition:', e);
      }
      setIsListening(false);

      // Keep current text - no changes needed
    } else {
      // Starting speech recognition
      try {
        // Save current text before starting (in case user typed something)
        lastKeyboardInputRef.current = userInput;

        // Start recognition
        speechRecognition.current.start();
        setIsListening(true);
      } catch (e) {
        console.error('Error starting speech recognition:', e);
        message.error('启动语音识别失败，请刷新页面后重试');
      }
    }
  };

  // Speak text using Web Speech API
  const speakText = (text: string) => {
    if (!voiceEnabled) return;

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'zh-CN';
    utterance.rate = 0.9; // Slightly slower for elderly users
    window.speechSynthesis.speak(utterance);
  };

  // Handle user input submission
  const handleInputSubmit = async () => {
    if (!userInput.trim()) {
      message.warning('请输入您需要的帮助');
      return;
    }

    // Stop listening if active
    if (isListening && speechRecognition.current) {
      speechRecognition.current.stop();
      setIsListening(false);
    }

    setLoading(true);
    try {
      // Log the start of goal processing
      logEvent('goal_submitted', { text: userInput });

      // Translate user goal to machine instructions
      const response = await translateUserGoal(userInput);
      setTranslatedGoal(response);
      setPhase(Phase.Preview);

      // Log preview shown
      logEvent('preview_shown');
    } catch (error) {
      console.error('Error translating goal:', error);
      message.error('无法理解您的请求，请重新表达');
    } finally {
      setLoading(false);
    }
  };

  // Execute the automation plan
  const handleProceed = async () => {
    if (!translatedGoal) return;
    
    // Log button click
    logEvent('button_click', { button: 'proceed' });

    setPhase(Phase.Running);
    try {
      // Make sure the AI config is applied before executing
      overrideAIConfig(config);
      
      // Create the agent
      const agent = extensionAgentForTab(true);
      currentAgentRef.current = agent; // Store reference
      
      // Start animation to show automation is running
      (window as any).midsceneWaterFlowAnimation?.enable();
      
      // Execute the midscene prompt
      await agent.aiAction(translatedGoal.midscene_prompt);
      
      // Store current goal for potential future reference
      setPreviousGoal(translatedGoal.goal);
      
      // Move to outcome phase
      setPhase(Phase.Outcome);
      
      // Log task completion
      logEvent('task_done', { success: true });
      
      // Optional: Speak confirmation
      if (voiceEnabled) {
        speakText('已完成');
      }
    } catch (error) {
      console.error('Error executing action:', error);
      message.error('执行任务失败');
      
      // Log error
      logEvent('task_done', { success: false, error: String(error) });
      
      setPhase(Phase.Compose);
    } finally {
      // Clean up the agent - THIS IS THE CRITICAL FIX
      try {
        if (currentAgentRef.current?.page) {
          await currentAgentRef.current.page.destroy();
          currentAgentRef.current = null;
        }
      } catch (e) {
        console.error('Error destroying agent:', e);
      }
      
      // Stop animation
      (window as any).midsceneWaterFlowAnimation?.disable();
    }
  };

  // When user clicks "修改" button
  const handleChange = () => {
    logEvent('button_click', { button: 'change' });

    if (translatedGoal?.summary) {
      setEditedSummary([...translatedGoal.summary]);
    }

    setIsEditing(true);
  };

  /**
   * Updates a specific summary step when the user edits it
   */
  const handleSummaryEdit = (index: number, newValue: string) => {
    const newSummary = [...editedSummary];
    newSummary[index] = newValue;
    setEditedSummary(newSummary);
  };

  // New function to regenerate plan from edited summary
  const handleSaveEdits = async () => {
    setLoading(true);
    try {
      // Pass original prompt for context
      const response = await regeneratePlanFromSummary(
        editedSummary,
        translatedGoal?.goal || userInput,
        translatedGoal?.midscene_prompt
      );

      setTranslatedGoal(response);
      setIsEditing(false);

      logEvent('summary_edited', {
        original: translatedGoal?.summary,
        edited: editedSummary
      });
    } catch (error) {
      console.error('Error regenerating plan:', error);
      message.error('无法更新计划，请重试');
    } finally {
      setLoading(false);
    }
  };

  // Handle cancel
  const handleCancel = () => {
    // Log button click
    logEvent('button_click', { button: 'cancel' });

    // Stop listening if active
    if (isListening && speechRecognition.current) {
      speechRecognition.current.stop();
      setIsListening(false);
    }

    setPhase(Phase.Compose);
    setUserInput('');
    setTranslatedGoal(null);
  };

  // Handle post-automation actions
  const handleOutcomeAction = async (action: 'reviewCart' | 'continueShopping') => {
    // Log button click
    logEvent('button_click', { button: action });
    
    const command = quickCommands[action];
    
    // Only execute if there's a command defined
    if (command) {
      try {
        // Make sure the AI config is applied before executing
        overrideAIConfig(config);
        
        // Create the agent
        const agent = extensionAgentForTab(true);
        currentAgentRef.current = agent; // Store reference
        
        // Execute the command
        await agent.aiAction(command);
      } catch (error) {
        console.error(`Error executing ${action}:`, error);
      } finally {
        // Clean up the agent
        try {
          if (currentAgentRef.current?.page) {
            await currentAgentRef.current.page.destroy();
            currentAgentRef.current = null;
          }
        } catch (e) {
          console.error('Error destroying agent:', e);
        }
      }
    }
    
    // Reset for new task (happens for all buttons)
    setPhase(Phase.Compose);
    setUserInput('');
    setTranslatedGoal(null);
    setGoalId(`goal_${Date.now()}`);
  };

  // Render the composer UI
  const renderComposer = () => (
    <div className="senior-composer">
      <div className="input-container">
        <TextArea
          ref={textAreaRef}
          value={userInput}
          onChange={handleKeyboardInput} // Use our custom handler
          placeholder="请告诉我您需要什么帮助，例如：我要买牛奶"
          autoSize={{ minRows: 2, maxRows: 4 }}
          disabled={loading}
        />
        <div className="input-actions">
          <Button
            type={isListening ? "primary" : "default"}
            icon={<AudioOutlined style={isListening ? { color: "white" } : {}} />}
            onClick={toggleListening}
            className={isListening ? 'listening' : ''}
            danger={isListening}
            disabled={loading}
          >
            {isListening ? "正在聆听..." : "语音输入"}
          </Button>
          <Button
            type="primary"
            icon={<SendOutlined />}
            onClick={handleInputSubmit}
            loading={loading}
            disabled={!userInput.trim()}
          >
            发送
          </Button>
        </div>
      </div>
    </div>
  );

  // Render the preview UI
  const renderPreview = () => {
    if (!translatedGoal) return null;

    return (
      <div className="senior-preview">
        <div className="preview-card">
          <Title level={4}>我的理解是</Title>
          {isEditing ? (
            // Editable list
            <List
              dataSource={editedSummary}
              renderItem={(item, index) => (
                <List.Item>
                  <Input
                    value={item}
                    onChange={(e) => handleSummaryEdit(index, e.target.value)}
                    style={{ width: '100%' }}
                  />
                </List.Item>
              )}
            />
          ) : (
            // Regular display list
            <List
              dataSource={translatedGoal.summary}
              renderItem={item => (
                <List.Item>
                  <Text>{item}</Text>
                </List.Item>
              )}
            />
          )}
          <Divider />
          <div className="preview-actions">
            {isEditing ? (
              <>
                <Button
                  type="primary"
                  size="large"
                  onClick={handleSaveEdits}
                  loading={loading}
                >
                  保存修改
                </Button>
                <Button
                  size="large"
                  onClick={() => setIsEditing(false)}
                >
                  取消修改
                </Button>
              </>
            ) : (
              <>
                <Button
                  type="primary"
                  size="large"
                  onClick={handleProceed}
                >
                  执行
                </Button>
                <Button
                  size="large"
                  onClick={handleChange}
                >
                  修改
                </Button>
                <Button
                  size="large"
                  onClick={handleCancel}
                >
                  取消
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  };

  // Render the running UI
  const renderRunning = () => (
    <div className="senior-running">
      <Spin indicator={<LoadingOutlined style={{ fontSize: 24 }} spin />} />
      <Text>正在执行...</Text>
    </div>
  );

  // Render the outcome UI
  const renderOutcome = () => (
    <div className="senior-outcome">
      <div className="outcome-card">
        <div className="outcome-header">
          <CheckCircleOutlined className="success-icon" />
          <Title level={4}>已完成！</Title>
        </div>
        <Divider />
        <div className="outcome-actions">
          <Button
            type="primary"
            size="large"
            onClick={() => handleOutcomeAction('reviewCart')}
          >
            查看购物车
          </Button>
          <Button
            size="large"
            onClick={() => handleOutcomeAction('continueShopping')}
          >
            继续购物
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <ConfigProvider theme={globalThemeConfig()}>
      <div className="senior-app-wrapper">
        <div className="senior-app-header">
          <div className="header-left">
            {/* <Logo withGithubStar={false} /> */}
            <Text className="app-description">购物助手</Text>
          </div>
          <div className="header-right">
            <EnvConfig /> {/* This preserves the API key configuration UI */}
            {/* <div className="voice-toggle">
              <Button 
                type="text" 
                icon={voiceEnabled ? <AudioOutlined /> : <AudioOutlined style={{ opacity: 0.5 }} />} 
                onClick={() => setVoiceEnabled(!voiceEnabled)}
              />
            </div> */}
          </div>
        </div>
        <div className="senior-app-container">
          {phase === Phase.Compose && renderComposer()}
          {phase === Phase.Preview && renderPreview()}
          {phase === Phase.Running && renderRunning()}
          {phase === Phase.Outcome && renderOutcome()}
        </div>
        <div className="senior-app-footer">
          <Text type="secondary">© 2025 智能购物助手</Text>
        </div>
      </div>
    </ConfigProvider>
  );
};