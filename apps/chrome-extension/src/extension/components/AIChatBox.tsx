import React, { useState, useRef, useEffect } from 'react';
import { Input, Button, List, message, Typography, Space } from 'antd';
import { AudioOutlined, SendOutlined, StopOutlined, CameraOutlined } from '@ant-design/icons';
import { ChromeExtensionProxyPage, ChromeExtensionProxyPageAgent } from '@midscene/web/chrome-extension';
import './AIChatBox.less';

const { TextArea } = Input;
const { Text } = Typography;

interface Message {
  role: 'user' | 'assistant';
  content: string;
  screenshot?: string;
}

interface AIChatBoxProps {
  systemPrompt?: string;
}

export const AIChatBox: React.FC<AIChatBoxProps> = ({ 
  systemPrompt = "You are a professional shopping assistant, and your service targets people with cognitive impairments. Please explain online shopping-related questions to them in easy-to-understand and short language. When you receive screenshots, please analyze the screenshots and give suggestions based on the user's questions." 
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [userInput, setUserInput] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [loading, setLoading] = useState(false);

  const speechRecognition = useRef<any>(null);
  const textAreaRef = useRef<any>(null);
  const lastKeyboardInputRef = useRef('');
  const isTypingRef = useRef(false);
  const currentTranscriptRef = useRef('');

  // 初始化语音识别
  const initSpeechRecognition = () => {
    if (!('webkitSpeechRecognition' in window)) {
      message.error('语音识别不支持在此浏览器');
      return false;
    }

    const SpeechRecognition = (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'zh-CN';

    recognition.onstart = () => {
      currentTranscriptRef.current = userInput;
    };

    recognition.onresult = (event: any) => {
      const transcript = Array.from(event.results)
        .map((result: any) => result[0].transcript)
        .join('');

      if (!isTypingRef.current) {
        currentTranscriptRef.current = transcript;
        setUserInput(transcript);
      } else {
        currentTranscriptRef.current = transcript;
      }
    };

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error', event);
      setIsListening(false);
      handleSpeechError(event.error);
    };

    recognition.onend = () => {
      if (isListening) {
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

  // 处理语音识别错误
  const handleSpeechError = (error: string) => {
    const errorMessages = {
      'not-allowed': '麦克风权限被拒绝，请在浏览器设置中允许访问麦克风',
      'audio-capture': '找不到麦克风设备',
      'network': '网络连接问题',
      'default': '语音识别出错，请尝试文字输入'
    };
    message.error(errorMessages[error as keyof typeof errorMessages] || errorMessages.default);
  };

  // 切换语音输入
  const toggleListening = async () => {
    if (!('webkitSpeechRecognition' in window)) {
      message.error('当前浏览器不支持语音识别');
      return;
    }

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

    if (!speechRecognition.current && !initSpeechRecognition()) return;

    if (isListening) {
      try {
        speechRecognition.current.stop();
      } catch (e) {
        console.error('Error stopping speech recognition:', e);
      }
      setIsListening(false);
    } else {
      try {
        lastKeyboardInputRef.current = userInput;
        speechRecognition.current.start();
        setIsListening(true);
      } catch (e) {
        console.error('Error starting speech recognition:', e);
        message.error('启动语音识别失败，请刷新页面后重试');
      }
    }
  };

  // 文本转语音
  const speakText = (text: string) => {
    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'zh-CN';
    utterance.rate = 0.9;
    
    utterance.onend = () => {
      setIsSpeaking(false);
    };

    setIsSpeaking(true);
    window.speechSynthesis.speak(utterance);
  };

  // 停止语音输出
  const stopSpeaking = () => {
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
  };

  // 处理用户输入
  const handleKeyboardInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    setUserInput(text);
    lastKeyboardInputRef.current = text;
    isTypingRef.current = true;

    setTimeout(() => {
      isTypingRef.current = false;
    }, 300);
  };

  // 获取页面截图
  const captureScreenshot = async () => {
    try {
      // 创建新的代理页面实例
      const page = new ChromeExtensionProxyPage(true);
      const agent = new ChromeExtensionProxyPageAgent(page);
      
      // 执行截图命令
      const result = await agent.aiAction('midscene_screenshot {"name": "chat_screenshot"}');
      console.log('Screenshot result:', result);
      
      // 清理资源
      await page.destroy();
      
      return true;
    } catch (error) {
      console.error('Screenshot failed:', error);
      message.error('无法获取截图，请确保已授予页面访问权限');
      return false;
    }
  };

  // 发送消息
  const handleSendMessage = async () => {
    if (!userInput.trim()) {
      message.warning('请输入内容');
      return;
    }

    if (isListening && speechRecognition.current) {
      speechRecognition.current.stop();
      setIsListening(false);
    }

    setLoading(true);

    try {
      // 添加用户消息
      const newMessage: Message = {
        role: 'user',
        content: userInput
      };
      setMessages(prev => [...prev, newMessage]);
      setUserInput('');

      // 创建代理页面实例
      const page = new ChromeExtensionProxyPage(true);
      const agent = new ChromeExtensionProxyPageAgent(page);

      try {
        // 获取当前标签页
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || !tab.id) {
          throw new Error('无法获取当前标签页信息');
        }

        // 确保调试器已附加
        try {
          await chrome.debugger.attach({ tabId: tab.id }, '1.3');
        } catch (debugError) {
          console.log('Debugger may already be attached or failed to attach:', debugError);
        }

        // 获取截图
        const screenshotResult = await agent.aiAction('midscene_screenshot {"name": "chat_screenshot"}');
        console.log('Screenshot result:', screenshotResult);
        message.success('截图成功');

        // 构建 AI 请求
        const aiRequest = {
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userInput }
          ],
          screenshot: screenshotResult
        };

        console.log('Sending AI request:', aiRequest);

        // 调用 AI 接口获取回复
        const response = await agent.aiAction(JSON.stringify({
          action: 'midscene_chat',
          data: aiRequest
        }));
        console.log('Raw AI response:', response);

        // 尝试解析响应
        let parsedResponse;
        try {
          parsedResponse = typeof response === 'string' ? JSON.parse(response) : response;
        } catch (e) {
          console.error('Failed to parse AI response:', e);
          throw new Error('AI 服务返回的数据格式无效');
        }

        if (!parsedResponse) {
          throw new Error('AI 服务没有返回数据');
        }

        // 提取响应内容
        const responseContent = parsedResponse.content || 
                              parsedResponse.message || 
                              (parsedResponse.choices && parsedResponse.choices[0]?.message?.content) ||
                              parsedResponse.response;

        if (!responseContent) {
          console.error('Invalid response structure:', parsedResponse);
          throw new Error('无法从 AI 响应中提取内容');
        }

        const aiMessage: Message = {
          role: 'assistant',
          content: responseContent
        };

        setMessages(prev => [...prev, aiMessage]);
        speakText(aiMessage.content);
      } finally {
        // 清理资源
        await page.destroy();
      }
    } catch (error) {
      console.error('Error in handleSendMessage:', error);
      let errorMessage = '获取回复失败，请重试';
      if (error instanceof Error) {
        console.error('Error details:', error.message);
        errorMessage = `获取回复失败: ${error.message}`;
      }
      message.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // 创建截图功能
  const takeScreenshot = async () => {
    try {
      const page = new ChromeExtensionProxyPage(true);
      const agent = new ChromeExtensionProxyPageAgent(page);
      
      await agent.aiAction('midscene_screenshot');
      message.success('截图已保存');
      
      // 清理资源
      await page.destroy();
    } catch (error) {
      console.error('Screenshot failed:', error);
      message.error('截图失败，请重试');
    }
  };

  // 组件卸载时清理
  useEffect(() => {
    return () => {
      if (speechRecognition.current) {
        speechRecognition.current.stop();
      }
      window.speechSynthesis.cancel();
    };
  }, []);

  return (
    <div className="ai-chatbox">
      <div className="chat-header">
        <Button
          icon={<CameraOutlined />}
          onClick={takeScreenshot}
          type="text"
        >
          截图
        </Button>
      </div>
      <div className="chat-messages">
        <List
          dataSource={messages}
          renderItem={(message) => (
            <List.Item className={`message ${message.role}`}>
              <div className="message-content">
                <Text>{message.content}</Text>
                {message.role === 'assistant' && (
                  <Button
                    type="text"
                    icon={<AudioOutlined />}
                    onClick={() => speakText(message.content)}
                    className="speak-button"
                  />
                )}
              </div>
            </List.Item>
          )}
        />
      </div>
      <div className="input-container">
        <TextArea
          ref={textAreaRef}
          value={userInput}
          onChange={handleKeyboardInput}
          placeholder="输入您的问题..."
          autoSize={{ minRows: 2, maxRows: 4 }}
          disabled={loading}
        />
        <div className="input-actions">
          <Space>
            <Button
              type={isListening ? "primary" : "default"}
              icon={<AudioOutlined />}
              onClick={toggleListening}
              className={isListening ? 'listening' : ''}
              danger={isListening}
              disabled={loading}
            >
              {isListening ? "正在聆听..." : "语音输入"}
            </Button>
            {isSpeaking && (
              <Button
                type="primary"
                danger
                icon={<StopOutlined />}
                onClick={stopSpeaking}
              >
                停止播放
              </Button>
            )}
            <Button
              type="primary"
              icon={<SendOutlined />}
              onClick={handleSendMessage}
              loading={loading}
              disabled={!userInput.trim()}
            >
              发送
            </Button>
          </Space>
        </div>
      </div>
    </div>
  );
}; 