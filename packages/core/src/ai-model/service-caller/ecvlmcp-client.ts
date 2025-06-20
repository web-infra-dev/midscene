import type { AIUsageInfo } from '@/types';
import { getAIConfig, MIDSCENE_ECVLMCP_ENDPOINT } from '@midscene/shared/env';
import { getDebug } from '@midscene/shared/logger';
import { assert } from '@midscene/shared/utils';
import type { ChatCompletionMessageParam } from 'openai/resources';
import { AIActionType } from '../common';

const debug = getDebug('ai:mcp-client');

interface McpRequest {
  messages: ChatCompletionMessageParam[];
  model?: string;
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  action_type?: number;
}

interface McpResponse {
  content: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export class EcvlmcpClient {
  private endpoint: string;

  constructor() {
    this.endpoint = getAIConfig(MIDSCENE_ECVLMCP_ENDPOINT) || 'http://127.0.0.1:3001/chat';
  }

  async chat(
    messages: ChatCompletionMessageParam[],
    options: {
      model?: string;
      temperature?: number;
      max_tokens?: number;
      actionType?: AIActionType;
    } = {}
  ): Promise<{ content: string; usage?: AIUsageInfo }> {
    debug('sending request to ECVLMCP endpoint:', this.endpoint);
    
    const requestPayload: McpRequest = {
      messages,
      model: 'qwen-vl',  // Use qwen-vl as the model name for ECVLMCP
      temperature: options.temperature || 0.1,
      max_tokens: options.max_tokens || 2048,
      stream: false,
      action_type: options.actionType,
    };

    const startTime = Date.now();
    
    try {
      // Add timeout and better error handling
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

      debug('making HTTP request to:', this.endpoint);
      debug('request payload size:', JSON.stringify(requestPayload).length, 'bytes');

      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(requestPayload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      debug('received response status:', response.status, response.statusText);

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unable to read error response');
        throw new Error(`ECVLMCP request failed: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const responseText = await response.text();
      debug('response text length:', responseText.length);

      let result: McpResponse;
      try {
        result = JSON.parse(responseText);
      } catch (parseError) {
        debug('JSON parse error:', parseError);
        throw new Error(`Invalid JSON response from ECVLMCP server: ${responseText.substring(0, 200)}...`);
      }

      const timeCost = Date.now() - startTime;

      if (!result.content) {
        throw new Error('Empty content from ECVLMCP server');
      }

      debug('ECVLMCP response received successfully, time cost:', timeCost, 'ms');

      return {
        content: result.content,
        usage: {
          prompt_tokens: result.usage?.prompt_tokens ?? 0,
          completion_tokens: result.usage?.completion_tokens ?? 0,
          total_tokens: result.usage?.total_tokens ?? 0,
          time_cost: timeCost,
        },
      };
    } catch (error) {
      const timeCost = Date.now() - startTime;
      debug('ECVLMCP request failed after', timeCost, 'ms');
      
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new Error('ECVLMCP request timeout (30s) - check if server is running and responsive');
        }
        if (error.message.includes('fetch failed') || error.message.includes('ECONNREFUSED')) {
          throw new Error(`Failed to connect to ECVLMCP server at ${this.endpoint} - is the server running?`);
        }
        debug('ECVLMCP request error details:', error);
        throw new Error(`Failed to call ECVLMCP: ${error.message}`);
      }
      
      throw new Error(`Failed to call ECVLMCP: Unknown error - ${String(error)}`);
    }
  }
}
