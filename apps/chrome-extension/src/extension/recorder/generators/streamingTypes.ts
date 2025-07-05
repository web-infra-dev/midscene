// Temporary streaming types for Chrome extension
// TODO: Replace with imports from @midscene/core once exports are updated

export interface StreamingCodeGenerationOptions {
  /** Whether to enable streaming output */
  stream?: boolean;
  /** Callback function to handle streaming chunks */
  onChunk?: StreamingCallback;
  /** Callback function to handle streaming completion */
  onComplete?: (finalCode: string) => void;
  /** Callback function to handle streaming errors */
  onError?: (error: Error) => void;
}

export type StreamingCallback = (chunk: CodeGenerationChunk) => void;

export interface CodeGenerationChunk {
  /** The incremental content chunk */
  content: string;
  /** The accumulated content so far */
  accumulated: string;
  /** Whether this is the final chunk */
  isComplete: boolean;
  /** Token usage information if available */
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    time_cost: number;
  };
}

export interface StreamingAIResponse {
  /** The final accumulated content */
  content: string;
  /** Token usage information */
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    time_cost: number;
  };
  /** Whether the response was streamed */
  isStreamed: boolean;
} 