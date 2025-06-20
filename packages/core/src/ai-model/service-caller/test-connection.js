#!/usr/bin/env node

/**
 * ECVLMCP Connection Test Tool
 * 
 * This tool helps diagnose connection issues between the ECVLMCP client and server.
 */

const http = require('http');
const https = require('https');

class EcvlmcpConnectionTester {
  constructor(endpoint = 'http://127.0.0.1:3001') {
    this.baseUrl = endpoint;
    this.chatUrl = `${endpoint}/chat`;
    this.healthUrl = `${endpoint}/health`;
  }

  async testHealthEndpoint() {
    console.log('🏥 Testing health endpoint...');
    try {
      const response = await this.makeRequest(this.healthUrl, 'GET');
      if (response.statusCode === 200) {
        console.log('✅ Health check passed');
        console.log('📊 Server info:', JSON.stringify(response.data, null, 2));
        return true;
      } else {
        console.log(`❌ Health check failed: ${response.statusCode}`);
        return false;
      }
    } catch (error) {
      console.log(`❌ Health check error: ${error.message}`);
      return false;
    }
  }

  async testChatEndpoint() {
    console.log('💬 Testing chat endpoint...');
    
    const testPayload = {
      messages: [
        {
          role: 'system',
          content: 'You are a helpful assistant for testing.'
        },
        {
          role: 'user',
          content: 'This is a connection test'
        }
      ],
      model: 'test-model',
      temperature: 0.1,
      max_tokens: 100
    };

    try {
      const response = await this.makeRequest(this.chatUrl, 'POST', testPayload);
      if (response.statusCode === 200) {
        console.log('✅ Chat endpoint working');
        console.log('📊 Response sample:', JSON.stringify(response.data, null, 2).substring(0, 200) + '...');
        return true;
      } else {
        console.log(`❌ Chat endpoint failed: ${response.statusCode}`);
        console.log('📄 Response:', response.data);
        return false;
      }
    } catch (error) {
      console.log(`❌ Chat endpoint error: ${error.message}`);
      return false;
    }
  }

  async testVisionEndpoint() {
    console.log('👁️ Testing vision/locate endpoint...');
    
    // Simple 1x1 pixel PNG in base64
    const testImage = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChAGA0zxzKwAAAABJRU5ErkJggg==';
    
    const testPayload = {
      messages: [
        {
          role: 'system',
          content: 'You are an expert in software testing. Identify elements in screenshots and return bbox coordinates.'
        },
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: {
                url: testImage,
                detail: 'high'
              }
            },
            {
              type: 'text',
              text: 'Find the login button'
            }
          ]
        }
      ],
      model: 'ecvlmcp-vision-v1',
      temperature: 0.1,
      max_tokens: 2048
    };

    try {
      const response = await this.makeRequest(this.chatUrl, 'POST', testPayload);
      if (response.statusCode === 200) {
        console.log('✅ Vision endpoint working');
        
        try {
          const content = JSON.parse(response.data.content);
          if (content.bbox && Array.isArray(content.bbox)) {
            console.log('✅ Vision response format correct');
            console.log('📍 Returned bbox:', content.bbox);
          } else {
            console.log('⚠️ Vision response format unexpected:', content);
          }
        } catch (e) {
          console.log('⚠️ Could not parse vision response content');
        }
        
        return true;
      } else {
        console.log(`❌ Vision endpoint failed: ${response.statusCode}`);
        return false;
      }
    } catch (error) {
      console.log(`❌ Vision endpoint error: ${error.message}`);
      return false;
    }
  }

  makeRequest(url, method = 'GET', data = null) {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      const isHttps = urlObj.protocol === 'https:';
      const client = isHttps ? https : http;

      const options = {
        hostname: urlObj.hostname,
        port: urlObj.port || (isHttps ? 443 : 80),
        path: urlObj.pathname + urlObj.search,
        method: method,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        timeout: 10000, // 10 second timeout
      };

      if (data) {
        const jsonData = JSON.stringify(data);
        options.headers['Content-Length'] = Buffer.byteLength(jsonData);
      }

      const req = client.request(options, (res) => {
        let responseData = '';

        res.on('data', (chunk) => {
          responseData += chunk;
        });

        res.on('end', () => {
          try {
            const parsedData = responseData ? JSON.parse(responseData) : {};
            resolve({
              statusCode: res.statusCode,
              headers: res.headers,
              data: parsedData
            });
          } catch (e) {
            resolve({
              statusCode: res.statusCode,
              headers: res.headers,
              data: responseData
            });
          }
        });
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      req.on('error', (error) => {
        reject(error);
      });

      if (data) {
        req.write(JSON.stringify(data));
      }

      req.end();
    });
  }

  async runAllTests() {
    console.log('🧪 ECVLMCP Connection Test Suite');
    console.log('='.repeat(50));
    console.log(`🔗 Testing server at: ${this.baseUrl}`);
    console.log('');

    const tests = [
      { name: 'Health Check', test: () => this.testHealthEndpoint() },
      { name: 'Chat Endpoint', test: () => this.testChatEndpoint() },
      { name: 'Vision Endpoint', test: () => this.testVisionEndpoint() },
    ];

    let passed = 0;
    const total = tests.length;

    for (const { name, test } of tests) {
      console.log(`Running ${name}...`);
      try {
        const result = await test();
        if (result) passed++;
      } catch (error) {
        console.log(`❌ ${name} threw error:`, error.message);
      }
      console.log('');
    }

    console.log('='.repeat(50));
    console.log(`📊 Test Results: ${passed}/${total} tests passed`);

    if (passed === total) {
      console.log('🎉 All tests passed! Server is working correctly.');
      console.log('');
      console.log('✅ You can now use ECVLMCP with these settings:');
      console.log('   export MIDSCENE_USE_ECVLMCP=1');
      console.log(`   export MIDSCENE_ECVLMCP_ENDPOINT=${this.chatUrl}`);
    } else {
      console.log('⚠️ Some tests failed. Please check:');
      console.log('');
      console.log('🔧 Troubleshooting steps:');
      console.log('1. Make sure the Python server is running:');
      console.log('   python example-mcp-server.py');
      console.log('');
      console.log('2. Check if the server is listening on the right port:');
      console.log('   curl http://localhost:3001/health');
      console.log('');
      console.log('3. Check firewall settings and network connectivity');
      console.log('');
      console.log('4. Verify the server logs for any errors');
    }

    return passed === total;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const endpoint = args[0] || process.env.MIDSCENE_ECVLMCP_ENDPOINT || 'http://127.0.0.1:3001';
  
  console.log('ECVLMCP Connection Tester');
  console.log('========================');
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log('Usage: node test-connection.js [endpoint]');
    console.log('');
    console.log('Options:');
    console.log('  endpoint    Server endpoint (default: http://localhost:3001)');
    console.log('  --help, -h  Show this help message');
    console.log('');
    console.log('Environment variables:');
    console.log('  MIDSCENE_ECVLMCP_ENDPOINT  Server endpoint');
    console.log('');
    console.log('Examples:');
    console.log('  node test-connection.js');
    console.log('  node test-connection.js http://localhost:3001');
    console.log('  MIDSCENE_ECVLMCP_ENDPOINT=http://server:3001 node test-connection.js');
    return;
  }

  const tester = new EcvlmcpConnectionTester(endpoint);
  const success = await tester.runAllTests();
  
  process.exit(success ? 0 : 1);
}

if (require.main === module) {
  main().catch((error) => {
    console.error('💥 Test runner error:', error);
    process.exit(1);
  });
}

module.exports = { EcvlmcpConnectionTester };
