// 扩展 Window 接口以包含 global 和 Buffer 属性
interface Window {
  global: typeof globalThis;
  Buffer: any;
}

// 版本变量
declare const __VERSION__: string;
