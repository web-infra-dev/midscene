# ECVLMCP Integration

ECVLMCP (Extended Computer Vision Language Model Control Protocol) is a visual model that acts as an MCP (Model Context Protocol) client, forwarding requests to an MCP server and returning processed results.

## Configuration

To use ECVLMCP, set the following environment variables:

```bash
# Enable ECVLMCP
MIDSCENE_USE_ECVLMCP=1

# MCP Server endpoint (optional, defaults to http://localhost:3001/chat)
MIDSCENE_ECVLMCP_ENDPOINT=http://localhost:3001/chat

# Model name (optional, defaults to 'default')
MIDSCENE_MODEL_NAME=your-model-name
```

## How it works

1. **Visual Model**: ECVLMCP operates as a visual model, using original screenshots without DOM tree markup
2. **MCP Client**: Acts as an MCP client, forwarding AI requests to the configured MCP server endpoint
3. **Direct Coordinates**: Returns pixel coordinates (bbox) directly like other visual models
4. **HTTP API**: Communicates with the MCP server via HTTP POST requests

## Request Flow

```
User API → PageAgent → Insight → AiLocateElement/plan → callAI → EcvlmcpClient → MCP Server
```

## API Interface

The ECVLMCP client sends requests to the MCP server with the following format:

```typescript
interface McpRequest {
  messages: ChatCompletionMessageParam[];
  model?: string;
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  action_type?: number;
}

interface McpResponse {
  content: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}
```

## Features

- **Visual Grounding**: Supports direct coordinate-based element location
- **Standard Integration**: Works with all existing Midscene APIs (aiAction, aiInput, aiTap, etc.)
- **Flexible Configuration**: Customizable endpoint and model settings
- **Error Handling**: Proper error handling and timeout management

## Usage Example

```typescript
// Set environment variables
process.env.MIDSCENE_USE_ECVLMCP = '1';
process.env.MIDSCENE_ECVLMCP_ENDPOINT = 'http://your-mcp-server:3001/chat';

// Use with Midscene as normal
await agent.aiAction('Click the login button');
await agent.aiInput('Enter username', 'john@example.com');
```

## Implementation Details

- **No DOM Tree**: ECVLMCP uses original screenshots without element markup
- **Coordinate Return**: Returns bbox coordinates like other visual models (Qwen-VL, UI-TARS)
- **Temperature**: Uses 0.1 temperature for consistent results
- **Token Limits**: Respects OPENAI_MAX_TOKENS configuration
- **Error Handling**: Throws descriptive errors for debugging

## Supported Operations

- Element location (aiLocate)
- Action planning (aiAction)
- Input operations (aiInput)
- Tap operations (aiTap)
- Query operations (aiQuery)
- All other Midscene vision model operations
