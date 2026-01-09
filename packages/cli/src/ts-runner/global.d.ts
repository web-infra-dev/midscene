type CdpConfig =
  | string
  | {
      endpoint: string;
      apiKey?: string;
      tabUrl?: string;
      tabIndex?: number;
    };

interface LaunchConfig {
  headed?: boolean;
  url?: string;
  viewport?: { width: number; height: number };
}

interface AgentProxy {
  connect(config?: CdpConfig): Promise<void>;
  launch(config?: LaunchConfig): Promise<void>;
  aiAct(prompt: string, options?: any): Promise<any>;
  aiAction(prompt: string, options?: any): Promise<any>;
  aiQuery<T = any>(prompt: string, options?: any): Promise<T>;
  aiAssert(assertion: string, options?: any): Promise<void>;
  aiLocate(prompt: string, options?: any): Promise<any>;
  aiWaitFor(assertion: string, options?: any): Promise<void>;
  destroy(): Promise<void>;
}

declare global {
  var agent: AgentProxy;
}

export {};
