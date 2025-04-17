#!/usr/bin/env node

// 这是适用于 ncc 编译的纯 CommonJS 入口文件
const path = require('node:path');
const { AndroidAgent, AndroidDevice } = require('@midscene/android');
const {
  PLAYGROUND_SERVER_PORT,
  SCRCPY_SERVER_PORT,
} = require('@midscene/shared/constants');
const PlaygroundServer = require('@midscene/web/midscene-server').default;
const fs = require('node:fs');
const { exec } = require('node:child_process');

// 直接加载 dist 中的文件
const ScrcpyServer = require('../dist/cjs/src/scrcpy-server').default;

// 自定义打开 URL 函数，使用 child_process 替代 open 模块
function openUrl(url) {
  const platform = process.platform;
  const cmd =
    platform === 'win32'
      ? 'start'
      : platform === 'darwin'
        ? 'open'
        : 'xdg-open';

  return new Promise((resolve, reject) => {
    exec(`${cmd} ${url}`, (error) => {
      if (error) {
        console.warn(`无法自动打开浏览器: ${error.message}`);
        resolve(); // 即使出错也不要中断流程
      } else {
        resolve();
      }
    });
  });
}

const staticDir = path.join(__dirname, '../static');
const playgroundServer = new PlaygroundServer(
  AndroidDevice,
  AndroidAgent,
  staticDir,
);
const scrcpyServer = new ScrcpyServer();

const main = async () => {
  try {
    await Promise.all([
      playgroundServer.launch(PLAYGROUND_SERVER_PORT),
      scrcpyServer.launch(SCRCPY_SERVER_PORT),
    ]);
    const url = `http://localhost:${playgroundServer.port}`;
    console.log(`Midscene playground server is running on ${url}`);
    await openUrl(url);
  } catch (error) {
    console.error('Failed to start servers:', error);
    process.exit(1);
  }
};

// 运行主函数
main().catch((error) => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
