import { Button, Form, Input } from 'antd';
import type React from 'react';
import { useCallback, useState } from 'react';
import type { FormValue } from '../types';

const { TextArea } = Input;

export interface SimplePromptInputProps {
  loading?: boolean;
  onSubmit: (value: FormValue) => void;
  disabled?: boolean;
  placeholder?: string;
}

/**
 * Simplified PromptInput for browser environments
 * Avoids Node.js dependencies by not using playground-utils
 */
export function SimplePromptInput({
  loading = false,
  onSubmit,
  disabled = false,
  placeholder = 'Enter your instruction here...',
}: SimplePromptInputProps) {
  const [prompt, setPrompt] = useState('');

  const handleSubmit = useCallback(() => {
    if (!prompt.trim() || loading || disabled) return;

    const formValue: FormValue = {
      type: 'aiAction', // Default action type
      prompt: prompt.trim(),
      params: {},
    };

    onSubmit(formValue);
    setPrompt(''); // Clear input after submit
  }, [prompt, loading, disabled, onSubmit]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  return (
    <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
      <div style={{ flex: 1 }}>
        <Form.Item style={{ marginBottom: 0 }}>
          <TextArea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={placeholder}
            onKeyDown={handleKeyDown}
            disabled={disabled || loading}
            autoSize={{ minRows: 1, maxRows: 4 }}
            style={{ resize: 'none' }}
          />
        </Form.Item>
      </div>
      <Button
        type="primary"
        onClick={handleSubmit}
        loading={loading}
        disabled={disabled || !prompt.trim()}
        style={{ marginBottom: '0px' }}
      >
        Send
      </Button>
    </div>
  );
}
