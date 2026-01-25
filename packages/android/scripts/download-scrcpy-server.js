#!/usr/bin/env node
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchVersion } from 'gh-release-fetch';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRCPY_VERSION = 'v3.0'; // 指定 scrcpy 版本

async function main() {
  // 解析命令行参数 --target
  const args = process.argv.slice(2);
  const targetArgIndex = args.findIndex((arg) => arg.startsWith('--target='));

  let serverBinPath;
  let binDir;

  if (targetArgIndex !== -1) {
    // 使用指定的目标路径（相对于当前工作目录）
    const targetPath = args[targetArgIndex].split('=')[1];
    serverBinPath = path.resolve(process.cwd(), targetPath);
    binDir = path.dirname(serverBinPath);
  } else {
    // 默认路径（相对于脚本所在目录）
    binDir = path.resolve(__dirname, '../bin');
    serverBinPath = path.resolve(binDir, 'server.bin');
  }

  // 检查是否已存在
  try {
    await fs.access(serverBinPath);
    console.log('[scrcpy] Server already exists, skipping download');
    return;
  } catch {
    // 文件不存在,继续下载
  }

  try {
    console.log(
      `[scrcpy] Downloading scrcpy server ${SCRCPY_VERSION} from GitHub...`,
    );

    // 确保目录存在
    await fs.mkdir(binDir, { recursive: true });

    // 从 GitHub Release 下载
    await fetchVersion({
      repository: 'Genymobile/scrcpy',
      version: SCRCPY_VERSION,
      package: `scrcpy-server-${SCRCPY_VERSION}`,
      destination: binDir,
      extract: false,
    });

    // 重命名为 server.bin
    const downloadedFile = path.join(binDir, `scrcpy-server-${SCRCPY_VERSION}`);
    await fs.rename(downloadedFile, serverBinPath);

    console.log('[scrcpy] Server downloaded successfully');
  } catch (error) {
    console.warn('[scrcpy] Warning: Failed to download server');
    console.warn(`[scrcpy] Error: ${error.message}`);
    console.warn('[scrcpy] Scrcpy screenshot will be disabled');
    console.warn(
      '[scrcpy] The package will fallback to standard ADB screenshot mode',
    );
    // 不抛出错误,允许安装继续
  }
}

main().catch((error) => {
  console.warn('[scrcpy] Unexpected error:', error);
  process.exit(0); // 不阻塞安装
});
