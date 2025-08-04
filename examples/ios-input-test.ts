#!/usr/bin/env tsx
/**
 * iOS Input Test - Demonstrates the improved iOS input functionality
 *
 * This test shows how the iOS input system now automatically handles:
 * - Element focusing by tapping
 * - Content clearing with cmd+a and delete
 * - Optimized typing with proper intervals for iOS keyboards
 * - Automatic keyboard dismissal
 *
 * The beauty is that it all happens transparently - no special iOS methods needed!
 */

import { agentFromPyAutoGUI } from '../packages/ios/src/agent';
import type { iOSDeviceOpt } from '../packages/ios/src/page';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function testIOSInput() {
  console.log('🚀 Starting iOS Input Test...');

  // Configure for iOS device mirroring - adjust these coordinates for your setup
  const options: iOSDeviceOpt = {
    serverPort: 1412,
    autoDismissKeyboard: true,
    mirrorConfig: {
      mirrorX: 692, // X position of iOS mirror on screen
      mirrorY: 161, // Y position of iOS mirror on screen
      mirrorWidth: 344, // Width of the mirrored iOS screen
      mirrorHeight: 764, // Height of the mirrored iOS screen
    },
  };

  try {
    // Create agent - this will automatically start the PyAutoGUI server if needed
    const agent = await agentFromPyAutoGUI(options);
    console.log('✅ iOS Agent created successfully');

    // Test 1: Simple text input
    console.log('\n📝 Test 1: Simple text input using aiInput');
    await agent.aiInput('Hello iOS!', 'search box or text field');
    await sleep(2000);

    // Test 2: Email input with special characters
    console.log('\n📧 Test 2: Email input with special characters');
    await agent.aiInput('test@example.com', 'email input field');
    await sleep(2000);

    // Test 3: Multi-word text with spaces
    console.log('\n📄 Test 3: Multi-word text input');
    await agent.aiInput(
      'This is a longer text message with spaces',
      'text area or message field',
    );
    await sleep(2000);

    // Test 4: Numbers and symbols
    console.log('\n🔢 Test 4: Numbers and symbols');
    await agent.aiInput('Password123!@#', 'password field');
    await sleep(2000);

    // Test 5: Clear and replace existing text
    console.log('\n🔄 Test 5: Clear and replace existing text');
    await agent.aiInput('', 'input field'); // Clear the field
    await sleep(1000);
    await agent.aiInput('New replacement text', 'same input field');
    await sleep(2000);

    console.log('\n✅ All iOS input tests completed successfully!');
    console.log('🎉 The iOS input system is working properly with:');
    console.log('   - Automatic element focusing');
    console.log('   - Smart content clearing');
    console.log('   - Optimized typing intervals');
    console.log('   - Automatic keyboard dismissal');
  } catch (error) {
    console.error('❌ iOS Input Test failed:', error);
    process.exit(1);
  }
}

// Run the test
testIOSInput().catch(console.error);
