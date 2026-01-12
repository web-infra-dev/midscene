import { Agent as PageAgent } from '@midscene/core/agent';

import { FileStorage } from '@midscene/core/storage/file';
import type StaticPage from './static-page';

export class StaticPageAgent extends PageAgent {
  constructor(page: StaticPage) {
    // Use FileStorage for Node.js environment (static page runs in Node.js)
    super(page, { storageProvider: new FileStorage() });
    this.dryMode = true;
  }
}
