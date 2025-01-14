import fs from 'node:fs';
import { ifInBrowser } from '@midscene/shared/utils';

// remember to include this file into extension's package
// extract html element from page
const scriptFileToRetrieve = chrome.runtime.getURL('lib/htmlElement.js');
let scriptFileContentCache: string | null = null;
export const getHtmlElementScript = async () => {
  if (scriptFileContentCache) return scriptFileContentCache;
  if (ifInBrowser) {
    const script = await fetch(scriptFileToRetrieve);
    scriptFileContentCache = await script.text();
    return scriptFileContentCache;
  }
  return fs.readFileSync(scriptFileToRetrieve, 'utf8');
};

// inject water flow animation
const waterFlowScriptFileToRetrieve =
  chrome.runtime.getURL('lib/water-flow.js');
let waterFlowScriptFileContentCache: string | null = null;
export const injectWaterFlowAnimation = async () => {
  if (waterFlowScriptFileContentCache) return waterFlowScriptFileContentCache; // 修复这里
  if (ifInBrowser) {
    const script = await fetch(waterFlowScriptFileToRetrieve);
    waterFlowScriptFileContentCache = await script.text();
    return waterFlowScriptFileContentCache;
  }
  return fs.readFileSync(waterFlowScriptFileToRetrieve, 'utf8');
};

// inject stop water flow animation
const stopWaterFlowScriptFileToRetrieve = chrome.runtime.getURL(
  'lib/stop-water-flow.js',
);
let stopWaterFlowScriptFileContentCache: string | null = null;
export const injectStopWaterFlowAnimation = async () => {
  if (stopWaterFlowScriptFileContentCache)
    return stopWaterFlowScriptFileContentCache;
  if (ifInBrowser) {
    const script = await fetch(stopWaterFlowScriptFileToRetrieve);
    stopWaterFlowScriptFileContentCache = await script.text();
    return stopWaterFlowScriptFileContentCache;
  }
  return fs.readFileSync(stopWaterFlowScriptFileToRetrieve, 'utf8');
};
