export type CdpConfig =
  | string
  | {
      endpoint: string;
      apiKey?: string;
      tabUrl?: string;
      tabIndex?: number;
    };

export interface LaunchConfig {
  headed?: boolean;
  url?: string;
  viewport?: { width: number; height: number };
}
