import { Agent as PageAgent } from '@midscene/core/agent';
import type { UIContext } from '@midscene/core';
import type StaticPage from './static-page';

export class StaticPageAgent extends PageAgent {
  private readonly staticPage: StaticPage;

  constructor(page: StaticPage) {
    // Disable report generation in browser environment to avoid Node.js fs module errors
    super(page, { generateReport: false });
    this.staticPage = page;
    this.dryMode = true;
  }

  override async getUIContext(): Promise<UIContext> {
    return this.staticPage.getUIContext();
  }
}
