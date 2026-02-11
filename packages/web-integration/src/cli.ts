import { runToolsCLI } from '@midscene/shared/cli';
import { WebMidsceneTools } from './mcp-tools';

const tools = new WebMidsceneTools();
runToolsCLI(tools, 'midscene-web', { stripPrefix: 'web_' }).catch((e) => {
  console.error(e);
  process.exit(1);
});
