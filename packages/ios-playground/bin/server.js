const path = require('node:path');
const { spawn } = require('node:child_process');
const { iOSDevice, iOSAgent } = require('@midscene/ios');
const { PLAYGROUND_SERVER_PORT } = require('@midscene/shared/constants');
const { PlaygroundServer } = require('@midscene/playground');

const staticDir = path.join(
  __dirname,
  '..',
  '..',
  '..',
  'apps',
  'ios-playground',
  'dist',
);
const playgroundServer = new PlaygroundServer(iOSDevice, iOSAgent, staticDir);

// Auto server management
let autoServerProcess = null;
const AUTO_SERVER_PORT = 1412;

/**
 * Check if auto server is running on the specified port
 */
const checkAutoServerRunning = async (port = AUTO_SERVER_PORT) => {
  return new Promise((resolve) => {
    const net = require('node:net');
    const client = new net.Socket();

    client.setTimeout(1000);

    client.on('connect', () => {
      client.destroy();
      resolve(true);
    });

    client.on('timeout', () => {
      client.destroy();
      resolve(false);
    });

    client.on('error', () => {
      resolve(false);
    });

    client.connect(port, 'localhost');
  });
};

/**
 * Start the auto server if it's not running
 */
const startAutoServer = async () => {
  try {
    const isRunning = await checkAutoServerRunning();

    if (isRunning) {
      console.log(
        `✅ PyAutoGUI server is already running on port ${AUTO_SERVER_PORT}`,
      );
      return true;
    }

    console.log(`🚀 Starting PyAutoGUI server on port ${AUTO_SERVER_PORT}...`);

    // Find the auto server script path
    const autoServerPath = path.join(
      __dirname,
      '..',
      '..',
      'ios',
      'bin',
      'server.js',
    );

    // Start the auto server process
    autoServerProcess = spawn('node', [autoServerPath, AUTO_SERVER_PORT], {
      stdio: 'pipe',
      env: {
        ...process.env,
        NODE_ENV: 'production',
      },
    });

    // Handle auto server output
    autoServerProcess.stdout.on('data', (data) => {
      const output = data.toString().trim();
      if (!output) return;
      console.log(`[PyAutoGUI] ${output}`);
    });

    autoServerProcess.stderr.on('data', (data) => {
      const output = data.toString().trim();
      if (!output) return;
      // Only surface real errors
      const isRealError =
        /Traceback|Exception|Error|Trace|Failed|CRITICAL/i.test(output);
      if (isRealError) {
        console.error(`[PyAutoGUI Error] ${output}`);
      } else {
        console.error(`[PyAutoGUI] ${output}`);
      }
    });

    autoServerProcess.on('error', (error) => {
      console.error('Failed to start PyAutoGUI server:', error);
    });

    autoServerProcess.on('close', (code) => {
      if (code !== 0) {
        console.error(`PyAutoGUI server exited with code ${code}`);
      }
      autoServerProcess = null;
    });

    // Wait a bit for the server to start
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Verify it's running
    const isNowRunning = await checkAutoServerRunning();
    if (isNowRunning) {
      console.log(
        `✅ PyAutoGUI server started successfully on port ${AUTO_SERVER_PORT}`,
      );
      return true;
    } else {
      console.error(
        `❌ Failed to start PyAutoGUI server on port ${AUTO_SERVER_PORT}`,
      );
      lastStartFailed = true;
      return false;
    }
  } catch (error) {
    console.error('Error starting auto server:', error);
    lastStartFailed = true;
    return false;
  }
};

const main = async () => {
  try {
    // Start auto server first
    await startAutoServer();

    await playgroundServer.launch(PLAYGROUND_SERVER_PORT);
    console.log(
      `Midscene iOS Playground server is running on http://localhost:${playgroundServer.port}`,
    );

    // Automatically open browser
    if (process.env.NODE_ENV !== 'test') {
      try {
        const { default: open } = await import('open');
        await open(`http://localhost:${playgroundServer.port}`);
      } catch (error) {
        console.log(
          'Could not open browser automatically. Please visit the URL manually.',
        );
      }
    }
  } catch (error) {
    console.error('Failed to start iOS playground server:', error);
    process.exit(1);
  }
};

// Handle graceful shutdown
const cleanup = () => {
  console.log('Shutting down gracefully...');

  if (playgroundServer) {
    playgroundServer.close();
  }

  if (autoServerProcess) {
    console.log('Stopping PyAutoGUI server...');
    autoServerProcess.kill('SIGTERM');
    autoServerProcess = null;
  }

  process.exit(0);
};

process.on('SIGTERM', cleanup);
process.on('SIGINT', cleanup);

main();
