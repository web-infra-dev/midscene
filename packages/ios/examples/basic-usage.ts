import { agentFromIOSSimulator, getConnectedDevices } from '@midscene/ios';

async function basicExample() {
  try {
    // List available devices
    console.log('Available iOS devices:');
    const devices = await getConnectedDevices();
    console.log(devices);

    // Connect to default simulator
    const agent = await agentFromIOSSimulator();
    
    // Launch Safari
    await agent.launch('com.apple.mobilesafari');
    
    // Perform AI-powered actions
    await agent.aiAction('tap on the address bar');
    await agent.aiAction('type "https://example.com"');
    await agent.aiAction('tap the go button');
    
    // Take a screenshot
    const screenshot = await agent.page.screenshotBase64();
    console.log('Screenshot taken:', screenshot.length, 'bytes');
    
    // Query the page
    const result = await agent.aiQuery('what is the title of the page?');
    console.log('Page title query result:', result);
    
  } catch (error) {
    console.error('Error in iOS automation:', error);
  }
}

// Only run if iOS simulator is available
if (process.platform === 'darwin') {
  basicExample();
} else {
  console.log('iOS automation is only available on macOS');
}