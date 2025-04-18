import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type {
  ListResourcesResult,
  ReadResourceRequest,
  ReadResourceResult,
} from '@modelcontextprotocol/sdk/types.js';

export const consoleLogs: string[] = [];
export const screenshots = new Map<string, string>();

export function notifyResourceListChanged(server: Server) {
  server.notification({
    method: 'notifications/resources/list_changed',
  });
}

export function notifyConsoleLogsUpdated(server: Server) {
  server.notification({
    method: 'notifications/resources/updated',
    params: { uri: 'console://logs' },
  });
}

export async function handleListResources(): Promise<ListResourcesResult> {
  return {
    resources: [
      {
        uri: 'console://logs',
        mimeType: 'text/plain',
        name: 'Browser console logs',
      },
      ...Array.from(screenshots.keys()).map((name) => ({
        uri: `screenshot://${name}`,
        mimeType: 'image/png',
        name: `Screenshot: ${name}`,
      })),
    ],
  };
}

export async function handleReadResource(
  request: ReadResourceRequest,
): Promise<ReadResourceResult> {
  const uri = request.params.uri.toString();

  if (uri === 'console://logs') {
    return {
      contents: [
        {
          uri,
          mimeType: 'text/plain',
          text: consoleLogs.join('\n'),
        },
      ],
    };
  }

  if (uri.startsWith('screenshot://')) {
    const name = uri.split('://')[1];
    const screenshot = screenshots.get(name);
    if (screenshot) {
      return {
        contents: [
          {
            uri,
            mimeType: 'image/png',
            blob: screenshot,
          },
        ],
      };
    }
  }

  throw new Error(`Resource not found: ${uri}`);
}
