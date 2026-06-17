import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { defineBddConfig } from '@midscene/bdd';

export default defineBddConfig({
  uiAgent: {
    type: 'web',
    url: pathToFileURL(join(__dirname, 'demo-app/index.html')).href,
  },
  // General agent for `# [agent]` / `$skill` steps — zero config reuses the
  // MIDSCENE_MODEL_* endpoint/key. Uncomment to customize:
  // generalAgent: { type: 'opencode' },
});
