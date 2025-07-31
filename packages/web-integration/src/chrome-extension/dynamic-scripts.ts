import fs from 'node:fs';
import { ifInBrowser, ifInWorker } from '@midscene/shared/utils';

// remember to include this file into extension's package
// extract html element from page
let scriptFileContentCache: string | null = null;
export const getHtmlElementScript = async () => {
  const scriptFileToRetrieve = chrome.runtime.getURL('scripts/htmlElement.js');
  if (scriptFileContentCache) return scriptFileContentCache;
  if (ifInBrowser || ifInWorker) {
    const script = await fetch(scriptFileToRetrieve);
    scriptFileContentCache = await script.text();
    return scriptFileContentCache;
  }
  return fs.readFileSync(scriptFileToRetrieve, 'utf8');
};

// inject water flow animation
let waterFlowScriptFileContentCache: string | null = null;
export const injectWaterFlowAnimation = async () => {
  const waterFlowScriptFileToRetrieve = chrome.runtime.getURL(
    'scripts/water-flow.js',
  );
  if (waterFlowScriptFileContentCache) return waterFlowScriptFileContentCache;
  if (ifInBrowser || ifInWorker) {
    const script = await fetch(waterFlowScriptFileToRetrieve);
    waterFlowScriptFileContentCache = await script.text();
    return waterFlowScriptFileContentCache;
  }
  return fs.readFileSync(waterFlowScriptFileToRetrieve, 'utf8');
};

// inject stop water flow animation
let stopWaterFlowScriptFileContentCache: string | null = null;
export const injectStopWaterFlowAnimation = async () => {
  const stopWaterFlowScriptFileToRetrieve = chrome.runtime.getURL(
    'scripts/stop-water-flow.js',
  );
  if (stopWaterFlowScriptFileContentCache)
    return stopWaterFlowScriptFileContentCache;
  if (ifInBrowser || ifInWorker) {
    const script = await fetch(stopWaterFlowScriptFileToRetrieve);
    stopWaterFlowScriptFileContentCache = await script.text();
    return stopWaterFlowScriptFileContentCache;
  }
  return fs.readFileSync(stopWaterFlowScriptFileToRetrieve, 'utf8');
};
