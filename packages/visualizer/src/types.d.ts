// Extend the Window interface to include global and Buffer properties
interface Window {
  global: typeof globalThis;
  Buffer: any;
}

// version variable
declare const __VERSION__: string;
