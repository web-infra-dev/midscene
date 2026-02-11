import { runToolsCLI } from '@midscene/shared/cli';
import { IOSMidsceneTools } from './mcp-tools';

const tools = new IOSMidsceneTools();
runToolsCLI(tools, 'midscene-ios', { stripPrefix: 'ios_' }).catch((e) => {
  console.error(e);
  process.exit(1);
});
