/**
 * Example MCP Server for ECVLMCP Integration
 * 
 * This is a simple HTTP server that demonstrates how to create an MCP server
 * that works with the ECVLMCP client in Midscene.
 */

const express = require('express');
const app = express();
const port = 3001;

app.use(express.json({ limit: '50mb' }));

// CORS middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'ECVLMCP MCP Server' });
});

// Main chat endpoint
app.post('/chat', async (req, res) => {
  try {
    const { messages, model = 'default', temperature = 0.1, max_tokens = 2048 } = req.body;
    
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ 
        error: 'Invalid request: messages array is required' 
      });
    }

    // Log the incoming request
    console.log(`[${new Date().toISOString()}] Received request:`);
    console.log(`- Model: ${model}`);
    console.log(`- Temperature: ${temperature}`);
    console.log(`- Max tokens: ${max_tokens}`);
    console.log(`- Messages count: ${messages.length}`);

    // Extract the user message and image
    const userMessage = messages.find(msg => msg.role === 'user');
    const systemMessage = messages.find(msg => msg.role === 'system');
    
    let hasImage = false;
    let imageUrl = '';
    let textContent = '';

    if (userMessage && userMessage.content) {
      if (Array.isArray(userMessage.content)) {
        // Find image and text content
        userMessage.content.forEach(item => {
          if (item.type === 'image_url') {
            hasImage = true;
            imageUrl = item.image_url.url;
          } else if (item.type === 'text') {
            textContent = item.text;
          }
        });
      } else if (typeof userMessage.content === 'string') {
        textContent = userMessage.content;
      }
    }

    console.log(`- Has image: ${hasImage}`);
    console.log(`- Text content: ${textContent.substring(0, 100)}...`);

    // Simulate processing delay
    await new Promise(resolve => setTimeout(resolve, 100));

    // Example response - In a real implementation, you would:
    // 1. Process the image using your vision model
    // 2. Parse the system prompt and user instructions
    // 3. Return appropriate bbox coordinates or action plans
    
    let responseContent;
    
    // Detect if this is an element location request
    if (systemMessage && systemMessage.content.includes('locate') && hasImage) {
      // Return a mock element location response
      responseContent = JSON.stringify({
        elements: [
          {
            id: "mock-element-123",
            reason: "Found mock element based on description",
            text: "Mock Button",
          }
        ],
        bbox: [100, 200, 150, 230], // [x1, y1, x2, y2]
        errors: []
      });
    } else if (systemMessage && systemMessage.content.includes('plan') && hasImage) {
      // Return a mock action plan response
      responseContent = JSON.stringify({
        log: "I can see the interface and will click the specified element",
        actions: [
          {
            type: "Tap",
            locate: {
              bbox: [100, 200, 150, 230],
              prompt: "target element"
            },
            param: {}
          }
        ],
        more_actions_needed_by_instruction: false
      });
    } else {
      // Generic response
      responseContent = JSON.stringify({
        result: "Mock response from ECVLMCP MCP Server",
        processed: true,
        timestamp: new Date().toISOString()
      });
    }

    // Calculate mock usage stats
    const usage = {
      prompt_tokens: Math.floor(Math.random() * 1000) + 500,
      completion_tokens: Math.floor(Math.random() * 200) + 50,
      total_tokens: 0
    };
    usage.total_tokens = usage.prompt_tokens + usage.completion_tokens;

    const response = {
      content: responseContent,
      usage
    };

    console.log(`[${new Date().toISOString()}] Sending response:`);
    console.log(`- Content length: ${responseContent.length}`);
    console.log(`- Usage: ${JSON.stringify(usage)}`);

    res.json(response);

  } catch (error) {
    console.error('Error processing request:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
});

// Start server
app.listen(port, () => {
  console.log(`ECVLMCP MCP Server running at http://localhost:${port}`);
  console.log(`Health check: http://localhost:${port}/health`);
  console.log(`Chat endpoint: http://localhost:${port}/chat`);
  console.log('');
  console.log('To use with Midscene, set:');
  console.log('MIDSCENE_USE_ECVLMCP=1');
  console.log(`MIDSCENE_ECVLMCP_ENDPOINT=http://localhost:${port}/chat`);
});

module.exports = app;
