import type {
  ConsolePlatformDefinition,
  ConsoleSessionSummary,
  CreateConsoleSessionPayload,
} from './types';

declare global {
  interface Window {
    midsceneConsole: {
      getPlatforms(): Promise<ConsolePlatformDefinition[]>;
      listSessions(): Promise<ConsoleSessionSummary[]>;
      createSession(
        payload: CreateConsoleSessionPayload,
      ): Promise<ConsoleSessionSummary>;
      stopSession(sessionId: string): Promise<boolean>;
    };
  }
}
