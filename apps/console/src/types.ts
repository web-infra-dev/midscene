export interface ConsolePlatformField {
  name: string;
  label: string;
  type: 'text' | 'number';
  placeholder?: string;
  defaultValue?: string | number;
}

export interface ConsolePlatformDefinition {
  id: string;
  title: string;
  description: string;
  fields: ConsolePlatformField[];
}

export interface ConsoleSessionSummary {
  id: string;
  platformId: string;
  title: string;
  createdAt: string;
  serverId: string;
  serverUrl: string;
  runtimeInfo?: {
    platformId?: string;
    title?: string;
    metadata?: Record<string, unknown>;
  } | null;
}

export interface CreateConsoleSessionPayload {
  platformId: string;
  options?: Record<string, unknown>;
}
