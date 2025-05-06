import type { UIContext } from '@midscene/core';
import { overrideAIConfig } from '@midscene/shared/env';
import {
  type PlaygroundResult,
  PlaygroundResultView,
  type ReplayScriptsInfo,
  useEnvConfig,
} from '@midscene/visualizer';
import { allScriptsFromDump } from '@midscene/visualizer';
import { Button, Card, Form, Input, message, Space, Alert, Select, Spin } from 'antd';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AudioOutlined } from '@ant-design/icons';
import './SeniorShopper.less';

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

export interface SeniorShopperProps {
  getAgent: (forceSameTabNavigation?: boolean) => any | null;
  showContextPreview?: boolean;
  dryMode?: boolean;
}

// SeniorShopper Component - Simplified version with just one action type
export function SeniorShopper({
  getAgent,
  showContextPreview = true,
  dryMode = false,
}: SeniorShopperProps) {
  // State management
  const [loading, setLoading] = useState(false);
  const [loadingProgressText, setLoadingProgressText] = useState('');
  const [result, setResult] = useState<PlaygroundResult | null>(null);
  const [replayScriptsInfo, setReplayScriptsInfo] = useState<ReplayScriptsInfo | null>(null);
  const [replayCounter, setReplayCounter] = useState(0);
  const [isChromePage, setIsChromePage] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);

  // Form and environment configuration
  const [form] = Form.useForm();
  const { config, deepThink } = useEnvConfig();
  const forceSameTabNavigation = useEnvConfig((state) => state.forceSameTabNavigation);

  // References
  const currentAgentRef = useRef<any>(null);
  const currentRunningIdRef = useRef<number | null>(0);
  const interruptedFlagRef = useRef<Record<number, boolean>>({});
  const speechRecognition = useRef<any>(null);
  const isTypingRef = useRef(false);
  const lastKeyboardInputRef = useRef('');
  const currentTranscriptRef = useRef('');
  const imageWidth = useRef(0);
  const imageHeight = useRef(0);

  // Environment configuration check
  const configAlreadySet = Object.keys(config || {}).length >= 1;

  // Check if we're on a chrome:// page
  useEffect(() => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const currentUrl = tabs[0]?.url || '';
      setIsChromePage(currentUrl.startsWith('chrome://'));
    });
  }, []);

  // Request microphone permission on component mount
  useEffect(() => {
    const requestInitialPermission = async () => {
      try {
        // First try to request through Chrome extension API
        await new Promise<void>((resolve, reject) => {
          chrome.permissions.request({
            permissions: ['microphone']
          }, (granted) => {
            if (granted) {
              console.log('Initial microphone permission granted');
              resolve();
            } else {
              reject(new Error('Permission denied'));
            }
          });
        });

        // Then try to get actual microphone access
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(track => track.stop());
        console.log('Initial microphone access successful');
      } catch (e) {
        console.error('Initial permission request failed:', e);
      }
    };

    requestInitialPermission();
  }, []);

  // Override AI configuration
  useEffect(() => {
    overrideAIConfig(config);
  }, [config]);

  const cleanup = () => {
    if (currentAgentRef.current) {
      try {
        currentAgentRef.current.destroy();
      } catch (e) {
        console.warn('Failed to destroy agent:', e);
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    return () => {
      cleanup();
    };
  }, []);

  const resetResult = () => {
    setResult(null);
    setLoading(false);
    setReplayScriptsInfo(null);
  };

  // Initialize speech recognition
  const initSpeechRecognition = () => {
    if (!('webkitSpeechRecognition' in window)) {
      message.error('Speech recognition is not supported in this browser');
      return false;
    }

    console.log('Initializing speech recognition...');
    const SpeechRecognition = (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      console.log('Speech recognition started');
      currentTranscriptRef.current = form.getFieldValue('prompt') || '';
    };

    recognition.onresult = (event: any) => {
      console.log('Speech recognition result received');
      const transcript = Array.from(event.results)
        .map((result: any) => result[0].transcript)
        .join('');

      if (!isTypingRef.current) {
        currentTranscriptRef.current = transcript;
        form.setFieldsValue({ prompt: transcript });
      } else {
        currentTranscriptRef.current = transcript;
      }
    };

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      setIsListening(false);

      if (event.error === 'not-allowed') {
        message.error('Microphone access denied. Please allow microphone access in your browser settings');
      } else if (event.error === 'audio-capture') {
        message.error('No microphone device found');
      } else if (event.error === 'network') {
        message.error('Network connection issue');
      } else {
        message.error('Speech recognition error. Please try text input');
      }
    };

    recognition.onend = () => {
      console.log('Speech recognition ended');
      if (isListening) {
        try {
          recognition.start();
          console.log('Restarting speech recognition...');
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
      message.error('Speech recognition is not supported in this browser');
      return;
    }

    // If already listening, stop it
    if (isListening) {
      try {
        console.log('Stopping speech recognition...');
        speechRecognition.current.stop();
        setIsListening(false);
        return;
      } catch (e) {
        console.error('Error stopping speech recognition:', e);
      }
    }

    // Try to get microphone access
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop());
      console.log('Microphone access successful');
    } catch (e) {
      console.error('Microphone access failed:', e);
      
      // Try to request permission again through Chrome API
      try {
        await new Promise<void>((resolve, reject) => {
          chrome.permissions.request({
            permissions: ['microphone']
          }, (granted) => {
            if (granted) {
              console.log('Microphone permission granted through retry');
              resolve();
            } else {
              reject(new Error('Permission denied'));
            }
          });
        });
      } catch (permError) {
        message.error(
          'To enable microphone access:\n' +
          '1. Right-click the extension icon in Chrome toolbar\n' +
          '2. Click "Manage Extension"\n' +
          '3. Find "Site access" section\n' +
          '4. Under "Microphone", select "Allow"\n' +
          '5. Refresh this page'
        );
        return;
      }
    }

    // Initialize speech recognition if needed
    if (!speechRecognition.current && !initSpeechRecognition()) return;

    try {
      console.log('Starting speech recognition...');
      lastKeyboardInputRef.current = form.getFieldValue('prompt') || '';
      speechRecognition.current.start();
      setIsListening(true);
    } catch (e) {
      console.error('Error starting speech recognition:', e);
      message.error('Failed to start speech recognition. Please refresh the page and try again');
    }
  };

  // Speak text using Web Speech API
  const speakText = (text: string) => {
    if (!voiceEnabled) return;

    // Cancel any ongoing speech
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.rate = 0.9; // Slightly slower for elderly users
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    // Handle errors
    utterance.onerror = (event) => {
      console.error('Speech synthesis error:', event);
      message.error('Speech playback failed');
    };

    window.speechSynthesis.speak(utterance);
  };

  // Handle text input to track typing state
  const handleTextInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    isTypingRef.current = true;
    lastKeyboardInputRef.current = e.target.value;
    setTimeout(() => {
      isTypingRef.current = false;
    }, 1000);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleRun();
    }
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
        try {
          // First try the direct action
          result.result = await activeAgent?.aiAction(value.prompt);
          
          // If voice is enabled and we got a result, provide feedback
          if (voiceEnabled && result.result) {
            speakText(`Found items matching: ${value.prompt}`);
          }
          
          // If direct action succeeded, end the process
          if (result.result) {
            try {
              result.dump = activeAgent?.dumpDataString()
                ? JSON.parse(activeAgent.dumpDataString())
                : null;
              result.reportHTML = activeAgent?.reportHTMLString() || null;
              await activeAgent?.page?.destroy();
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
            }
            return;
          }
          
          // If direct action failed silently, throw an error to trigger search fallback
          throw new Error('Direct action failed, switching to search mode');
        } catch (e) {
          // If direct action fails, try using search as a fallback
          console.log('Direct action failed, trying search...');
          setLoadingProgressText('Searching for your items...');
          
          // 2. Search for items
          let searchAttempts = 0;
          const maxSearchAttempts = 3;
          let searchSuccess = false;

          while (searchAttempts < maxSearchAttempts && !searchSuccess) {
            try {
              searchAttempts++;
              setLoadingProgressText(`Searching for items (attempt ${searchAttempts}/${maxSearchAttempts})...`);
              
              // Extract just the product name/description from the prompt
              console.log('Original prompt:', value.prompt);
              const searchQuery = value.prompt
                .replace(/(find|search|show|get|buy|purchase|order|add|select|choose|pick|want|need)\s+/gi, '')
                // Remove first person references
                .replace(/\b(me|my|mine|i|i'm|im|i'll|ill|i've|ive|i'd|id)\b/gi, '')
                // Clean up any extra spaces
                .replace(/\s+/g, ' ')
                .trim();
              console.log('Cleaned search query:', searchQuery);
              
              // Check if there is a best selling requirement
              const hasBestSellingRequirement = /best\s*sell(ing|er|ers)?/i.test(value.prompt);
              if (hasBestSellingRequirement) {
                setLoadingProgressText('Sorting by best selling products...');
                try {
                  await activeAgent?.aiAction('click the "Sort by" button');
                  await new Promise(resolve => setTimeout(resolve, 1000));
                  await activeAgent?.aiAction('select "Best Selling" or similar option from sort options');
                  setLoadingProgressText('Sorted by best selling.');
                  await new Promise(resolve => setTimeout(resolve, 1000));
                } catch (sortError) {
                  console.error('Failed to sort by best selling:', sortError);
                  setLoadingProgressText('Could not sort by best selling, continuing with default order...');
                  if (voiceEnabled) {
                    speakText('Could not sort by best selling, continuing with default order.');
                  }
                }
              }
              
              // Scroll to the top of the page before searching
              setLoadingProgressText('Scrolling to the top to find the search bar...');
              await activeAgent?.aiAction('scroll to the top of the page');
              await new Promise(resolve => setTimeout(resolve, 500));
              
              await activeAgent?.aiAction(`search for "${searchQuery}"`);
              
              // Wait for results to load
              setLoadingProgressText('Waiting for search results...');
              await new Promise(resolve => setTimeout(resolve, 2000));
              
              // Check if there are any sorting requirements
              const hasPriceRequirement = /(under|below|less than|more than|above|over)\s+\$?\d+/i.test(value.prompt);
              const hasRatingRequirement = /(rated|rating|review|star|stars)/i.test(value.prompt);
              
              if (hasPriceRequirement || hasRatingRequirement) {
                setLoadingProgressText('Applying sorting based on requirements...');
                
                // Try to find and click the sort button
                try {
                  await activeAgent?.aiAction('click the "Sort by" button');
                  await new Promise(resolve => setTimeout(resolve, 1000));
                  
                  if (hasPriceRequirement) {
                    // If price requirement is "under" or "below", sort by price low to high
                    // If price requirement is "above" or "over", sort by price high to low
                    const isLowToHigh = /(under|below|less than)/i.test(value.prompt);
                    await activeAgent?.aiAction(`select "${isLowToHigh ? 'Price: Low to High' : 'Price: High to Low'}" from sort options`);
                  } else if (hasRatingRequirement) {
                    await activeAgent?.aiAction('select "Avg. Customer Review" from sort options');
                  }
                  
                  // Wait for sorted results to load
                  setLoadingProgressText('Waiting for sorted results...');
                  await new Promise(resolve => setTimeout(resolve, 2000));
                } catch (sortError) {
                  console.error('Failed to apply sorting:', sortError);
                  setLoadingProgressText('Could not apply sorting, continuing with unsorted results...');
                  if (voiceEnabled) {
                    speakText('Could not apply sorting, continuing with unsorted results');
                  }
                }
              }
              
              // Scroll through results to load more items and check for matches after each scroll
              setLoadingProgressText('Looking for matching products...');

              // Build a more explicit assertion based on requirements
              let matchingAssertion = `there are products containing "${searchQuery}" in their title or description`;
              
              if (hasPriceRequirement) {
                const priceMatch = value.prompt.match(/(under|below|less than|more than|above|over)\s+\$?(\d+)/i);
                if (priceMatch) {
                  const [_, condition, amount] = priceMatch;
                  const price = parseInt(amount);
                  if (condition.toLowerCase().includes('under') || condition.toLowerCase().includes('below') || condition.toLowerCase().includes('less than')) {
                    matchingAssertion += ` with prices (any price below $${price} is acceptable, including prices with cents like $${price-1}.99 or $2 39 where cents are shown as a smaller number after the dollar sign)`;
                  } else {
                    matchingAssertion += ` with prices (any price above $${price} is acceptable, including prices with cents like $${price+1}.99 or $2 39 where cents are shown as a smaller number after the dollar sign)`;
                  }
                }
              }
              
              if (hasRatingRequirement) {
                matchingAssertion += ' with ratings';
              }

              // Check for matches before any scrolling
              setLoadingProgressText('Checking for matching products (before scrolling)...');
              console.log('Checking for products with assertion:', matchingAssertion);
              
              // Debug what products are visible and being compared
              const visibleProducts = await activeAgent?.aiQuery('What products do you see on the screen? List their full titles and prices.');
              console.log('Visible products:', visibleProducts);
              
              // First check if we have any products with visible titles that match
              const productsWithTitles = await activeAgent?.aiQuery('List all visible products that have a title containing "' + searchQuery + '"');
              if (productsWithTitles && !productsWithTitles.includes('no products found') && !productsWithTitles.includes('not found')) {
                console.log('Found products with matching titles:', productsWithTitles);
                searchSuccess = true;
                setLoadingProgressText('Found matching products! Attempting to add to cart...');
                if (voiceEnabled) {
                  speakText('Found matching products. Adding to cart.');
                }
                
                try {
                  // Try to add the first matching product to cart
                  await activeAgent?.aiAction('click "Add to Cart" or similar button for the first matching ' + searchQuery + ' product');
                  setLoadingProgressText('Successfully added to cart! Shopping finished.');
                  if (voiceEnabled) {
                    speakText('Added to cart successfully. Task complete!');
                  }
                } catch (cartError) {
                  console.error('Failed to add to cart:', cartError);
                  setLoadingProgressText('Found products but could not add to cart. You may need to select options first. Shopping finished.');
                  if (voiceEnabled) {
                    speakText('Found products but could not add to cart automatically. Task complete!');
                  }
                }
                
                break; // Exit the search attempts loop
              }

              // If no products with titles found, then check the general assertion
              let hasMatchingProducts = await activeAgent?.aiAssert(matchingAssertion);
              if (hasMatchingProducts) {
                // Debug which products matched and why
                const matchExplanation = await activeAgent?.aiQuery('Which products matched our search for "' + searchQuery + '" and why did they match?');
                console.log('Match explanation:', matchExplanation);
                
                searchSuccess = true;
                setLoadingProgressText('Found matching products! Attempting to add to cart...');
                if (voiceEnabled) {
                  speakText('Found matching products. Adding to cart.');
                }

                try {
                  // Try to add the first matching product to cart
                  await activeAgent?.aiAction('click "Add to Cart" or similar button for the first matching ' + searchQuery + ' product');
                  setLoadingProgressText('Successfully added to cart! Shopping finished.');
                  if (voiceEnabled) {
                    speakText('Added to cart successfully. Task complete!');
                  }
                } catch (cartError) {
                  console.error('Failed to add to cart:', cartError);
                  setLoadingProgressText('Found products but could not add to cart. You may need to select options first. Shopping finished.');
                  if (voiceEnabled) {
                    speakText('Found products but could not add to cart automatically. Task complete!');
                  }
                }
                
                break; // Exit the search attempts loop
              }

              // Only scroll if absolutely no matches found
              if (!searchSuccess) {
                for (let i = 0; i < 3 && !searchSuccess; i++) {
                  setLoadingProgressText(`Scrolling down (attempt ${i+1}/3)...`);
                  await activeAgent?.aiAction('scroll down');
                  await new Promise(resolve => setTimeout(resolve, 1000));
                  
                  // Debug what products are visible after scrolling
                  const newVisibleProducts = await activeAgent?.aiQuery('What products do you see on the screen now? List their full titles and prices.');
                  console.log('Visible products after scroll:', newVisibleProducts);
                  
                  setLoadingProgressText('Checking for matching products (after scrolling)...');
                  console.log('Checking for products with assertion:', matchingAssertion);
                  hasMatchingProducts = await activeAgent?.aiAssert(matchingAssertion);
                  
                  if (hasMatchingProducts) {
                    // Debug which products matched and why
                    const matchExplanation = await activeAgent?.aiQuery('Which products matched our search for "' + searchQuery + '" and why did they match?');
                    console.log('Match explanation:', matchExplanation);
                    
                    searchSuccess = true;
                    setLoadingProgressText('Found matching products!');
                    if (voiceEnabled) {
                      speakText('Found matching products');
                    }
                    break; // Exit both loops when products are found after scrolling
                  }
                }
              }

              // Only show no matches message if we've tried everything and still found nothing
              if (!searchSuccess && searchAttempts === maxSearchAttempts) {
                console.log('No products found matching:', matchingAssertion);
                setLoadingProgressText('No matching products found. Shopping finished.');
                if (voiceEnabled) {
                  speakText('No matching products found. Task complete!');
                }
              } else if (searchSuccess) {
                break; // Exit the search attempts loop if products were found
              }
            } catch (error) {
              console.error(`Search attempt ${searchAttempts} failed:`, error);
              if (searchAttempts === maxSearchAttempts) {
                throw error;
              }
              await new Promise(resolve => setTimeout(resolve, 1000));
            }
          }

          if (!searchSuccess) {
            throw new Error('No matching products found after searching and scrolling through results');
          }
        }
      } else if (value.type === 'aiQuery') {
        try {
          result.result = await activeAgent?.aiQuery(value.prompt);
        } catch (e: any) {
          result.error = formatErrorMessage(e);
          console.error(e);
          
          // Speak the error if voice is enabled
          if (voiceEnabled) {
            speakText('Sorry, there was a problem with the shopping process');
          }
        }
      } else if (value.type === 'aiAssert') {
        try {
          result.result = await activeAgent?.aiAssert(value.prompt, undefined, {
            keepRawResponse: true,
          });
        } catch (e: any) {
          result.error = formatErrorMessage(e);
          console.error(e);
          
          // Speak the error if voice is enabled
          if (voiceEnabled) {
            speakText('Sorry, there was a problem with the shopping process');
          }
        }
      } else if (value.type === 'aiTap') {
        try {
          result.result = await activeAgent?.aiTap(value.prompt, {
            deepThink,
          });
        } catch (e: any) {
          result.error = formatErrorMessage(e);
          console.error(e);
          
          // Speak the error if voice is enabled
          if (voiceEnabled) {
            speakText('Sorry, there was a problem with the shopping process');
          }
        }
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
      if (result?.dump) {
        const info = allScriptsFromDump(result.dump);
        setReplayScriptsInfo(info);
        setReplayCounter((c) => c + 1);
      } else {
        setReplayScriptsInfo(null);
      }
      console.log(`time taken: ${Date.now() - startTime}ms`);
    } catch (e: any) {
      result.error = formatErrorMessage(e);
      console.error(e);
      
      // Speak the error if voice is enabled
      if (voiceEnabled) {
        speakText('Sorry, there was a problem with the shopping process');
      }
    }
  }, [form, getAgent, forceSameTabNavigation, deepThink, voiceEnabled]);

  const handleStop = async () => {
    const thisRunningId = currentRunningIdRef.current;
    if (thisRunningId) {
      interruptedFlagRef.current[thisRunningId] = true;
      await cleanup();
      resetResult();
    }
  };

  const runButtonEnabled = !!getAgent && configAlreadySet && !isChromePage;
  const stoppable = !dryMode && loading;

  return (
    <div className="senior-shopper-container">
      <Card 
        title={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>SeniorShopper Assistant</span>
            <Space>
              <Button
                type="text"
                icon={<AudioOutlined style={{ 
                  fontSize: '20px',
                  color: voiceEnabled ? '#1890ff' : '#d9d9d9'
                }} />}
                onClick={() => {
                  // Cancel any ongoing speech
                  window.speechSynthesis.cancel();
                  
                  if (!voiceEnabled && isListening && speechRecognition.current) {
                    speechRecognition.current.stop();
                    setIsListening(false);
                  }
                  setVoiceEnabled(!voiceEnabled);
                  message.info(voiceEnabled ? 'Voice features disabled' : 'Voice features enabled');
                }}
                title={voiceEnabled ? 'Disable voice features' : 'Enable voice features'}
              />
            </Space>
          </div>
        } 
        className="shopper-card"
      >
        {isChromePage && (
          <Alert
            message="Cannot use on Chrome pages"
            description="Please navigate to a regular webpage (http://, https://, or file://) to use Midscene."
            type="warning"
            showIcon
            style={{ marginBottom: '16px' }}
          />
        )}
        <Form form={form} layout="vertical">
          <Form.Item name="type" initialValue="aiAction" rules={[{ required: true, message: 'Please select an action type' }]}>
            <Select
              className="action-type-select"
              options={[
                { value: 'aiAction', label: 'Action' },
                { value: 'aiQuery', label: 'Query' },
                { value: 'aiAssert', label: 'Assert' },
                { value: 'aiTap', label: 'Tap' },
              ]}
            />
          </Form.Item>

          <Form.Item name="prompt" label="What would you like to shop for?">
            <Input.TextArea
              rows={4}
              onChange={handleTextInput}
              placeholder="Describe what you want to buy or find on this shopping website..." 
              disabled={isChromePage}
            />
          </Form.Item>

          <Space>
            {voiceEnabled && (
              <Button
                icon={<AudioOutlined />}
                onClick={toggleListening}
                type={isListening ? 'primary' : 'default'}
                className={isListening ? 'listening' : ''}
              >
                {isListening ? 'Stop Voice' : 'Voice Input'}
              </Button>
            )}
            <Button
              type="primary"
              onClick={handleRun}
              disabled={!runButtonEnabled || loading}
              loading={loading}
            >
              Start Shopping
            </Button>
            {stoppable && (
              <Button onClick={handleStop}>
                Stop
              </Button>
            )}
          </Space>
        </Form>

        {loading && (
          <div className="loading-indicator">
            {loadingProgressText || 'Searching for your items...'}
          </div>
        )}

        <div className="result-section">
          <PlaygroundResultView
            result={result}
            loading={loading}
            serviceMode="In-Browser-Extension"
            replayScriptsInfo={replayScriptsInfo}
            replayCounter={replayCounter}
            loadingProgressText={loadingProgressText}
          />
        </div>
      </Card>
    </div>
  );
} 