import { runToolsCLI } from '@midscene/shared/cli';
import { ComputerMidsceneTools } from './mcp-tools';

const tools = new ComputerMidsceneTools();
runToolsCLI(tools, 'midscene-computer', { stripPrefix: 'computer_' }).catch(
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
