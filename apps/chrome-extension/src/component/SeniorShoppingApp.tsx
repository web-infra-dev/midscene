import React, { useRef, useState } from 'react';
import { message, Button, Input } from 'antd';
import { AudioOutlined } from '@ant-design/icons';
import './SeniorShoppingApp.less';

// Add type definition for WebkitSpeechRecognition
interface WebkitSpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onstart: () => void;
  onend: () => void;
  onerror: (event: { error: string }) => void;
  onresult: (event: { results: { [key: number]: { [key: number]: { transcript: string } } } }) => void;
}

const requestMicrophonePermission = async (): Promise<boolean> => {
  try {
    // First check if permission is already granted
    const permissionStatus = await navigator.permissions.query({ name: 'microphone' as PermissionName });
    
    if (permissionStatus.state === 'granted') {
      return true;
    }
    
    if (permissionStatus.state === 'denied') {
      message.error('麦克风权限被拒绝，请在浏览器设置中允许访问麦克风');
      return false;
    }
    
    // If permission is 'prompt', explicitly request access
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    // Clean up the stream immediately - we just needed the permission
    stream.getTracks().forEach(track => track.stop());
    return true;
  } catch (err) {
    console.error('Error requesting microphone permission:', err);
    message.error('无法获取麦克风权限，请确保允许浏览器访问麦克风');
    return false;
  }
};

export const SeniorShoppingApp: React.FC = () => {
  const [isListening, setIsListening] = useState(false);
  const [userInput, setUserInput] = useState('');
  const currentTranscriptRef = useRef<string>('');
  const isTypingRef = useRef<boolean>(false);
  const lastKeyboardInputRef = useRef<string>('');
  const speechRecognition = useRef<WebkitSpeechRecognition | null>(null);

  const initSpeechRecognition = async () => {
    if (!('webkitSpeechRecognition' in window)) {
      message.error('语音识别不支持在此浏览器');
      return false;
    }

    // Check/request permission first
    const hasPermission = await requestMicrophonePermission();
    if (!hasPermission) {
      return false;
    }

    const SpeechRecognition = (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'zh-CN';

    recognition.onstart = () => {
      setIsListening(true);
      // Save current text as starting point
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

      switch (event.error) {
        case 'not-allowed':
          message.error('麦克风权限被拒绝，请在浏览器设置中允许访问麦克风');
          break;
        case 'audio-capture':
          message.error('找不到麦克风设备');
          break;
        case 'network':
          message.error('网络连接问题');
          break;
        default:
          message.error('语音识别出错，请尝试文字输入');
      }
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

  const toggleListening = async () => {
    if (!('webkitSpeechRecognition' in window)) {
      message.error('当前浏览器不支持语音识别');
      return;
    }

    if (isListening && speechRecognition.current) {
      // Stopping speech recognition
      try {
        speechRecognition.current.stop();
        setIsListening(false);
      } catch (e) {
        console.error('Error stopping speech recognition:', e);
      }
    } else {
      // Starting speech recognition
      try {
        // Initialize if not already done
        if (!speechRecognition.current && !(await initSpeechRecognition())) {
          return;
        }

        // Save current text before starting
        lastKeyboardInputRef.current = userInput;

        // Start recognition
        if (speechRecognition.current) {
          await speechRecognition.current.start();
          setIsListening(true);
        }
      } catch (e) {
        console.error('Error starting speech recognition:', e);
        message.error('启动语音识别失败，请刷新页面后重试');
        setIsListening(false);
      }
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    setUserInput(text);
    lastKeyboardInputRef.current = text;
    isTypingRef.current = true;

    setTimeout(() => {
      isTypingRef.current = false;
    }, 300);
  };

  return (
    <div className="senior-shopping-app">
      <div className="input-container">
        <Input.TextArea
          value={userInput}
          onChange={handleInputChange}
          placeholder="请输入您想购买的商品..."
          autoSize={{ minRows: 2, maxRows: 4 }}
        />
        <div className="button-container">
          <Button
            type={isListening ? "primary" : "default"}
            icon={<AudioOutlined />}
            onClick={toggleListening}
            className={isListening ? 'listening' : ''}
            danger={isListening}
          >
            {isListening ? "正在聆听..." : "语音输入"}
          </Button>
        </div>
      </div>
    </div>
  );
}; 