// /// <reference types="chrome" />
// import type { WebUIContext } from '@midscene/web/utils';

// export const workerMessageTypes = {
//   SAVE_CONTEXT: 'save-context',
//   GET_CONTEXT: 'get-context',
// };

// // save screenshot
// export interface WorkerRequestSaveContext {
//   context: WebUIContext;
// }

// export interface WorkerResponseSaveContext {
//   id: string;
// }

// // get screenshot
// export interface WorkerRequestGetContext {
//   id: string;
// }

// export interface WorkerResponseGetContext {
//   context: WebUIContext;
// }

// export async function sendToWorker<Payload, Result = any>(
//   type: string,
//   payload: Payload,
// ): Promise<Result> {
//   return new Promise((resolve, reject) => {
//     chrome.runtime.sendMessage({ type, payload }, (response) => {
//       if (response.error) {
//         reject(response.error);
//       } else {
//         resolve(response);
//       }
//     });
//   });
// }

// export function getPlaygroundUrl(cacheContextId: string) {
//   return chrome.runtime.getURL(
//     `./pages/playground.html?cache_context_id=${cacheContextId}`,
//   );
// }

// export async function activeTab(): Promise<chrome.tabs.Tab> {
//   return new Promise((resolve, reject) => {
//     chrome.tabs?.query({ active: true, currentWindow: true }, (tabs) => {
//       if (tabs?.[0]) {
//         resolve(tabs[0]);
//       } else {
//         reject(new Error('No active tab found'));
//       }
//     });
//   });
// }

// export async function currentWindowId(): Promise<number> {
//   return new Promise((resolve, reject) => {
//     chrome.windows.getCurrent((window) => {
//       if (window?.id) {
//         resolve(window.id);
//       } else {
//         reject(new Error('No active window found'));
//       }
//     });
//   });
// }
