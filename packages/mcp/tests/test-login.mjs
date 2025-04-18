// import os from 'node:os'; // Needed to get home directory
// import path from 'node:path'; // Needed for joining paths
// // open-zhihu.js
// import puppeteer from 'puppeteer';

// // --- Function to get the default Chrome user data directory ---
// function getDefaultUserDataDir() {
//   const platform = os.platform();
//   const homeDir = os.homedir();

//   switch (platform) {
//     case 'darwin': // macOS
//       return path.join(
//         homeDir,
//         'Library',
//         'Application Support',
//         'Google',
//         'Chrome',
//       );
//     case 'win32': // Windows
//       return path.join(homeDir, 'AppData', 'Local', 'Google', 'Chrome', 'User Data');
//     case 'linux': // Linux
//       return path.join(homeDir, '.config', 'google-chrome'); // Or 'chromium' if using Chromium
//     default:
//       console.warn(
//         `Unsupported platform: ${platform}. You might need to manually specify the userDataDir.`,
//       );
//       return null;
//   }
// }
// // --- ---

// async function openZhihuWithLogin() {
//   let browser = null;
//   const userDataDir = getDefaultUserDataDir();

//   if (!userDataDir) {
//     console.error('Could not determine default Chrome user data directory.');
//     return;
//   }

//   console.log(
//     `Attempting to use Chrome user data directory: ${userDataDir}`,
//   );
//   console.warn(
//     '确保在运行此脚本前已完全关闭所有使用此配置文件的 Chrome 窗口!',
//   );

//   try {
//     browser = await puppeteer.launch({
//       headless: false,
//       executablePath: '/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome', // 保持你的 Chrome 路径
//       userDataDir: '/Users/bytedance/Library/Application Support/Google/Chrome', // <-- 使用你的用户数据目录
//       // args: [
//       //   // Sometimes needed if profiles are locked, use with caution
//       //   // '--disable-features=LockProfileCookieDatabase'
//       // ]
//     });

//     console.log('Opening a new page...');
//     const page = await browser.newPage();

//     console.log('Navigating to zhihu.com...');
//     await page.goto('https://www.zhihu.com/', {
//       waitUntil: 'networkidle2', // 等待网络空闲可能更能确保登录状态加载
//     });

//     console.log(
//       'Successfully navigated to Zhihu.com. Check if you are logged in.',
//     );
//     console.log(
//       'The browser window will remain open. Close it manually when done.',
//     );

//     // Keep browser open
//   } catch (error) {
//     console.error(
//       'An error occurred. Did you close all Chrome instances before running?',
//     );
//     console.error(error);
//     if (browser) {
//       try {
//         await browser.close();
//       } catch (closeError) {
//         console.error('Failed to close browser after error:', closeError);
//       }
//     }
//   }
// }

// openZhihuWithLogin();
