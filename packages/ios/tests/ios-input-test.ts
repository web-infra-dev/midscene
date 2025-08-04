import { agentFromPyAutoGUI } from '../src/agent/index';

async function testIOSInput() {
  console.log('🧪 Testing iOS input functionality...');

  try {
    // Create iOS agent with mirror configuration
    const agent = await agentFromPyAutoGUI({
      serverPort: 1412,
      autoDismissKeyboard: true,
      mirrorConfig: {
        mirrorX: 692,
        mirrorY: 161,
        mirrorWidth: 344,
        mirrorHeight: 764,
      },
    });

    console.log('✅ iOS agent created successfully');

    // Test basic input functionality
    console.log('🔤 Testing basic input...');

    // Simulate clicking on a text input field (coordinates would be from AI detection)
    await agent.page.tap({ left: 172, top: 300 }); // Example coordinates
    console.log('📱 Tapped on input field');

    // Test the new iOS input method
    await agent.page.aiInputIOS('Hello iOS Testing!', { center: [172, 300] });
    console.log('✅ iOS input completed');

    // Test keyboard press
    await agent.page.keyboardPress('return');
    console.log('✅ Return key pressed');

    // Test clearing input
    await agent.page.clearInput({ center: [172, 300] });
    console.log('✅ Input cleared');

    // Test regular input method
    await agent.page.input('Regular input test');
    console.log('✅ Regular input completed');

    console.log('🎉 All iOS input tests passed!');
  } catch (error) {
    console.error('❌ iOS input test failed:', error);
    process.exit(1);
  }
}

// Run the test
if (require.main === module) {
  testIOSInput();
}

export { testIOSInput };
