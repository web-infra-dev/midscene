import { Agent as PageAgent } from '@midscene/core/agent';

import {
  FileStorage,
  defaultFilePathResolver,
} from '@midscene/core/storage/file';
import type StaticPage from './static-page';

export class StaticPageAgent extends PageAgent {
  constructor(page: StaticPage) {
    // Use FileStorage and defaultFilePathResolver for Node.js environment
    super(page, {
      storageProvider: new FileStorage(),
      filePathResolver: defaultFilePathResolver,
    });
    this.dryMode = true;
  }
}
