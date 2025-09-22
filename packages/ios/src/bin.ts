import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

interface SimulatorDevice {
  udid: string;
  name: string;
  state: string;
}

interface SimulatorRuntime {
  devices: SimulatorDevice[];
}

// Helper function to execute commands using spawn and return promise
function executeCommand(
  command: string,
  args: string[] = [],
  options: { cwd?: string; timeout?: number } = {}
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      stdio: 'pipe',
      cwd: options.cwd,
    });
    
    let stdout = '';
    let stderr = '';
    
    proc.stdout?.on('data', (data) => {
      stdout += data.toString();
    });
    
    proc.stderr?.on('data', (data) => {
      stderr += data.toString();
    });
    
    const timeoutId = options.timeout ? setTimeout(() => {
      proc.kill();
      reject(new Error(`Command timeout after ${options.timeout}ms`));
    }, options.timeout) : null;
    
    proc.on('close', (code) => {
      if (timeoutId) clearTimeout(timeoutId);
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`Command failed with exit code ${code}: ${stderr}`));
      }
    });
    
    proc.on('error', (error) => {
      if (timeoutId) clearTimeout(timeoutId);
      reject(error);
    });
  });
}

// Check if a command exists
async function commandExists(command: string): Promise<boolean> {
  try {
    await executeCommand('which', [command]);
    return true;
  } catch {
    return false;
  }
}

// Get simulator devices
async function getSimulatorDevices(): Promise<SimulatorDevice[]> {
  try {
    const { stdout } = await executeCommand('xcrun', ['simctl', 'list', 'devices', '--json']);
    const devices = JSON.parse(stdout);
    
    const allDevices: SimulatorDevice[] = [];
    for (const [runtime, deviceList] of Object.entries(devices.devices)) {
      if (Array.isArray(deviceList)) {
        allDevices.push(...(deviceList as SimulatorDevice[]));
      }
    }
    
    return allDevices;
  } catch (error) {
    console.log('   ⚠️  Unable to get simulator list');
    return [];
  }
}

// Start simulator if not booted
async function ensureSimulatorBooted(udid: string): Promise<void> {
  try {
    const devices = await getSimulatorDevices();
    const device = devices.find(d => d.udid === udid);
    
    if (!device) {
      console.log(`   ❌ Simulator not found: ${udid}`);
      return;
    }
    
    if (device.state !== 'Booted') {
      console.log('   ⚠️  Simulator not booted, starting...');
      await executeCommand('xcrun', ['simctl', 'boot', udid]);
      console.log('   ⏳ Waiting for simulator to boot...');
      await new Promise(resolve => setTimeout(resolve, 5000));
    } else {
      console.log('   ✅ Simulator already booted');
    }
  } catch (error) {
    console.log('   ⚠️  Simulator status check failed');
  }
}

// Kill existing WebDriverAgent processes
async function killExistingWDA(): Promise<void> {
  try {
    console.log('🛑 Stopping existing WebDriverAgent...');
    await executeCommand('pkill', ['-f', 'xcodebuild.*WebDriverAgent']).catch(() => {});
    await executeCommand('pkill', ['-f', 'WebDriverAgentRunner']).catch(() => {});
    await new Promise(resolve => setTimeout(resolve, 2000));
  } catch {
    // Ignore errors, processes might not exist
  }
}

// Start WebDriverAgent using spawn
async function startWebDriverAgent(wdaPath: string, udid: string): Promise<void> {
  console.log('🔧 Starting WebDriverAgent...');
  
  const wdaProcess = spawn('xcodebuild', [
    '-project', 'WebDriverAgent.xcodeproj',
    '-scheme', 'WebDriverAgentRunner',
    '-destination', `id=${udid}`,
    'test'
  ], {
    cwd: wdaPath,
    stdio: 'inherit'
  });
  
  console.log(`   📝 WebDriverAgent process PID: ${wdaProcess.pid}`);
  
  // Wait for server to start
  console.log('⏳ Waiting for WebDriverAgent server to start...');
  for (let i = 0; i < 30; i++) {
    try {
      const response = await fetch('http://localhost:8100/status');
      if (response.ok) {
        console.log('✅ WebDriverAgent server started!');
        console.log('');
        console.log('📊 Server status:');
        
        try {
          const status = await response.json();
          console.log(`   Version: ${status.value.build.version}`);
          console.log(`   Device: ${status.value.device}`);
          console.log(`   iOS: ${status.value.os.version}`);
        } catch {
          console.log('   Status retrieval failed, but server is running');
        }
        
        console.log('');
        console.log('🎉 Startup complete!');
        console.log('');
        console.log('💡 Usage tips:');
        console.log('   • Server address: http://localhost:8100');
        console.log('   • Stop service: pkill -f WebDriverAgent');
        console.log('   • View processes: ps aux | grep WebDriverAgent');
        return;
      }
    } catch {
      // Continue waiting
    }
    
    console.log(`   Waiting... (${i + 1}/30)`);
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  console.log('⏰ Wait timeout, please check logs');
  wdaProcess.kill();
}

async function prepareWebDriverAgent() {
  try {
    console.log('🚀 Midscene iOS WebDriverAgent Setup');
    console.log('');
    
    // 1. Check if WebDriverAgent package exists
    console.log('1️⃣ Checking WebDriverAgent package...');
    const packageRoot = path.resolve(__dirname, '../..');
    const wdaPath = path.join(packageRoot, 'node_modules', 'appium-webdriveragent');
    const projectPath = path.join(wdaPath, 'WebDriverAgent.xcodeproj');
    
    if (!fs.existsSync(wdaPath)) {
      console.log('   ❌ appium-webdriveragent package not found');
      console.log('   💡 Please install dependencies first: pnpm install');
      process.exit(1);
    }
    
    if (!fs.existsSync(projectPath)) {
      console.log('   ❌ WebDriverAgent.xcodeproj not found');
      console.log(`   📂 Search path: ${projectPath}`);
      process.exit(1);
    }
    
    console.log('   ✅ WebDriverAgent package found');
    console.log(`   📂 Path: ${wdaPath}`);
    
    // 2. Get package information
    console.log('');
    console.log('2️⃣ Getting package information...');
    try {
      const packageJsonPath = path.join(wdaPath, 'package.json');
      if (fs.existsSync(packageJsonPath)) {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        console.log(`   📦 Package name: ${packageJson.name}`);
        console.log(`   🏷️  Version: ${packageJson.version}`);
        if (packageJson.description) {
          console.log(`   📝 Description: ${packageJson.description}`);
        }
      }
    } catch (error) {
      console.log('   ⚠️  Unable to read package information');
    }
    
    // 3. Check Xcode and simulator
    console.log('');
    console.log('3️⃣ Checking environment...');
    
    if (!(await commandExists('xcodebuild'))) {
      console.log('   ❌ xcodebuild not found, please install Xcode');
      process.exit(1);
    }
    console.log('   ✅ Xcode command line tools installed');
    
    if (!(await commandExists('xcrun'))) {
      console.log('   ❌ iOS simulator environment abnormal');
      console.log('   💡 Please ensure Xcode and iOS Simulator are installed');
      process.exit(1);
    }
    console.log('   ✅ iOS simulator environment normal');
    
    // 4. Check if WebDriverAgent should be started
    const shouldStart = process.argv.includes('--start');
    const udidArg = process.argv.find(arg => arg.startsWith('--udid='));
    const defaultUDID = 'E28A24D6-1FFE-4461-94D9-B7254FEA7930';
    const udid = udidArg ? udidArg.split('=')[1] : defaultUDID;
    
    if (shouldStart) {
      console.log('');
      console.log('4️⃣ Starting WebDriverAgent...');
      console.log(`📱 Simulator UDID: ${udid}`);
      
      // Stop existing processes
      await killExistingWDA();
      
      // Check and start simulator
      console.log('📱 Checking simulator status...');
      await ensureSimulatorBooted(udid);
      
      // Start WebDriverAgent
      await startWebDriverAgent(wdaPath, udid);
    } else {
      // 4. Show usage instructions
      console.log('');
      console.log('🎉 WebDriverAgent preparation complete!');
      console.log('');
      console.log('📋 Usage:');
      console.log('   🚀 Start WebDriverAgent:');
      console.log('      npx @midscene/ios prepare --start');
      console.log('');
      console.log('   📱 Specify simulator UDID:');
      console.log('      npx @midscene/ios prepare --start --udid=YOUR_SIMULATOR_UDID');
      console.log('');
      console.log('   🛑 Stop WebDriverAgent:');
      console.log('      pkill -f WebDriverAgent');
      console.log('');
      console.log('   📊 Check server status:');
      console.log('      curl -s http://localhost:8100/status');
      console.log('');
      console.log('   📋 List all simulators:');
      console.log('      xcrun simctl list devices');
      console.log('');
      console.log('💡 Tips:');
      console.log('   • WebDriverAgent server address: http://localhost:8100');
      console.log(`   • Default simulator UDID: ${defaultUDID}`);
      console.log('   • View all simulators with "xcrun simctl list devices"');
      console.log('');
      console.log('🎯 Goal achieved: You can now run automated tests with Midscene iOS!');
    }
    
  } catch (error) {
    console.error('❌ Preparation failed:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

prepareWebDriverAgent();