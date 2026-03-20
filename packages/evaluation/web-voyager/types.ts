export interface TaskResult {
  taskId: string;
  webName: string;
  question: string;
  agentAnswer: string | null;
  /** Final screenshot as base64 */
  finalScreenshot: string | null;
  /** All screenshots collected during execution */
  screenshots: string[];
  success: boolean | null; // null = not yet judged
  judgeVerdict: 'SUCCESS' | 'NOT_SUCCESS' | null;
  judgeReason: string | null;
  error: string | null;

  // Metrics
  totalSteps: number;
  totalTimeMs: number;
  tokenUsage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  /** Estimated cost in USD */
  estimatedCostUsd: number;
}

export interface EvalConfig {
  /** Which subset to run: '30' | '75' | 'full' */
  subset: '30' | '75';
  /** Max time per task in ms */
  taskTimeoutMs: number;
  /** Max replanning cycles per task */
  maxReplanningCycles: number;
  /** Browser viewport */
  viewport: { width: number; height: number };
  /** Whether to run headless */
  headless: boolean;
  /** Judge model for auto-evaluation */
  judgeModel: string;
  /** Output directory for results */
  outputDir: string;
  /** Screenshot shrink factor to reduce token usage */
  screenshotShrinkFactor: number;
}

export interface EvalSummary {
  modelName: string;
  modelFamily: string;
  timestamp: string;
  config: EvalConfig;
  totalTasks: number;
  completedTasks: number;
  successCount: number;
  failCount: number;
  errorCount: number;
  successRate: number;
  avgSteps: number;
  avgTimeMs: number;
  avgInputTokens: number;
  avgOutputTokens: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
  perWebsite: Record<
    string,
    {
      total: number;
      success: number;
      successRate: number;
      avgSteps: number;
      avgTimeMs: number;
      avgTokens: number;
    }
  >;
  results: TaskResult[];
}
