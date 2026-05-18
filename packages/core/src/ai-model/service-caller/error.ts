import type { AIUsageInfo } from '@/types';

// Error class that preserves usage and rawResponse when AI call parsing fails.
export class AIResponseParseError extends Error {
  usage?: AIUsageInfo;
  rawResponse: string;

  constructor(message: string, rawResponse: string, usage?: AIUsageInfo) {
    super(message);
    this.name = 'AIResponseParseError';
    this.rawResponse = rawResponse;
    this.usage = usage;
  }
}
