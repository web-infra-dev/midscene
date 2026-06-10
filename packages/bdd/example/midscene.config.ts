import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { defineBddConfig } from '@midscene/bdd';

export default defineBddConfig({
  uiAgent: {
    type: 'web',
    url: pathToFileURL(join(__dirname, 'demo-app/index.html')).href,
  },
});
