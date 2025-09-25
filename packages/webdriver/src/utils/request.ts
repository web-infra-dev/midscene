import { getDebug } from '@midscene/shared/logger';

const debugRequest = getDebug('webdriver:request');

export interface RequestOptions {
  method: 'GET' | 'POST' | 'DELETE' | 'PUT';
  url: string;
  data?: any;
  timeout?: number;
}

export class WebDriverRequestError extends Error {
  constructor(
    message: string,
    public status?: number,
    public response?: any,
  ) {
    super(message);
    this.name = 'WebDriverRequestError';
  }
}

export async function makeWebDriverRequest(
  baseUrl: string,
  method: string,
  endpoint: string,
  data?: any,
  timeout = 30000,
): Promise<any> {
  const url = `${baseUrl}${endpoint}`;

  debugRequest(
    `${method} ${url}${data ? ` with data: ${JSON.stringify(data)}` : ''}`,
  );

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: data ? JSON.stringify(data) : undefined,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    let responseData;
    const contentType = response.headers.get('content-type');

    if (contentType?.includes('application/json')) {
      responseData = await response.json();
    } else {
      const textData = await response.text();
      responseData = textData;
    }

    if (!response.ok) {
      const errorMessage =
        responseData?.error ||
        responseData?.message ||
        `HTTP ${response.status}`;
      throw new WebDriverRequestError(
        `WebDriver request failed: ${errorMessage}`,
        response.status,
        responseData,
      );
    }

    return responseData;
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof WebDriverRequestError) {
      throw error;
    }

    if (error instanceof Error && error.name === 'AbortError') {
      throw new WebDriverRequestError(`Request timeout after ${timeout}ms`);
    }

    debugRequest(`Request failed: ${error}`);
    throw new WebDriverRequestError(`Request failed: ${error}`);
  }
}
