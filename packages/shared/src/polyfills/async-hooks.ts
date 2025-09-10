/**
 * Browser polyfill for Node.js async_hooks module
 * Provides empty implementation for browser environments where async_hooks is not available
 */
const AsyncLocalStorage = {};
export { AsyncLocalStorage };
