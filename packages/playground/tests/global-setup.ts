// Global setup that runs before any tests or modules are loaded
// This ensures process object exists before shared/us-keyboard-layout.ts is imported

export default function setup() {
  // Setup process object for Node.js APIs used by @midscene/shared
  if (typeof process === 'undefined') {
    (global as any).process = {
      platform: 'darwin',
      env: { NODE_ENV: 'test' },
      cwd: () => '/test',
      version: 'v18.0.0',
      versions: { node: '18.0.0' },
    };
  }
}
