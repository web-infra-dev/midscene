#!/usr/bin/env node
// Re-export from @midscene/mcp
export * from '@midscene/mcp';
import('@midscene/mcp').catch(console.error);
