import { runToolsCLI } from '@midscene/shared/cli';
import { AndroidMidsceneTools } from './mcp-tools';

const tools = new AndroidMidsceneTools();
runToolsCLI(tools, 'midscene-android', { stripPrefix: 'android_' }).catch(
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
