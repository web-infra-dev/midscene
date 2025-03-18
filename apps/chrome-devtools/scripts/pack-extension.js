#!/usr/bin/env node

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 获取当前文件的目录路径
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 读取package.json
const packageJsonPath = path.resolve(__dirname, '../package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

// 创建extension目录
const extensionDir = path.resolve(__dirname, '../extension');
if (!fs.existsSync(extensionDir)) {
  fs.mkdirSync(extensionDir, {
    recursive: true,
  });
}

// 源目录 - dist
const distDir = path.resolve(__dirname, '../dist');

// 创建zip文件
const version = packageJson.version;
const zipFileName = `midscene-extension-v${version}.zip`;
const zipFilePath = path.resolve(extensionDir, zipFileName);

// 删除已存在的zip文件
if (fs.existsSync(zipFilePath)) {
  fs.unlinkSync(zipFilePath);
}

// 直接将dist目录内容打包到extension目录中的zip文件
execSync(`cd ${distDir} && zip -r ${zipFilePath} .`);

console.log(
  `Extension packed successfully: ${zipFileName} (saved in extension directory)`,
);
