/**
 * Example: Using runWdaRequest with generic type parameters
 *
 * This demonstrates how to use the runWdaRequest method with TypeScript
 * generic parameters to get type-safe responses from WebDriverAgent API.
 */

import { agentFromWebDriverAgent } from '../src';

// Define types for common WebDriver API responses
interface WDAStatusResponse {
  value: {
    message: string;
    state: string;
    os: {
      name: string;
      version: string;
      sdkVersion: string;
    };
    ios: {
      simulatorVersion: string;
      ip: string;
    };
    build: {
      time: string;
    };
  };
  sessionId: string | null;
}

interface WDAScreenInfo {
  value: {
    statusBarSize: {
      width: number;
      height: number;
    };
    scale: number;
  };
  sessionId: string;
}

interface WDAElementResponse {
  value: {
    ELEMENT: string;
    'element-6066-11e4-a52e-4f735466cecf': string;
  };
  sessionId: string;
}

async function main() {
  const agent = await agentFromWebDriverAgent();
  await agent.launch('https://www.example.com');

  // Example 1: Get device status with typed response
  const status = await agent.runWdaRequest<WDAStatusResponse>('GET', '/status');
  console.log('Device OS:', status.value.os.name);
  console.log('iOS Version:', status.value.os.version);

  // Example 2: Get screen information with typed response
  const screenInfo = await agent.runWdaRequest<WDAScreenInfo>(
    'GET',
    '/wda/screen',
  );
  console.log('Screen scale:', screenInfo.value.scale);
  console.log('Status bar height:', screenInfo.value.statusBarSize.height);

  // Example 3: Find element with typed response
  const element = await agent.runWdaRequest<WDAElementResponse>(
    'POST',
    '/element',
    {
      using: 'accessibility id',
      value: 'search-button',
    },
  );
  console.log('Element ID:', element.value.ELEMENT);

  // Example 4: Without type parameter (defaults to 'any')
  const response = await agent.runWdaRequest('GET', '/wda/device/info');
  console.log('Raw response:', response);

  // Example 5: Press home button (no response body expected)
  await agent.runWdaRequest<void>('POST', '/wda/pressButton', {
    name: 'home',
  });

  // Example 6: Custom type for your specific endpoint
  interface CustomResponse {
    success: boolean;
    data: {
      id: string;
      name: string;
    };
  }
  const custom = await agent.runWdaRequest<CustomResponse>(
    'GET',
    '/custom/endpoint',
  );
  if (custom.success) {
    console.log('Custom data:', custom.data.name);
  }
}

// Run example
main().catch(console.error);
