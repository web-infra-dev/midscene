import type { FileChooser, Page as PlaywrightPageType } from 'playwright';
import { Page as BasePage } from '../puppeteer/base-page';
import type { WebPageOpt } from '../web-element';

export class WebPage extends BasePage<'playwright', PlaywrightPageType> {
  private playwrightFileChooserHandler?: (chooser: FileChooser) => Promise<void>;

  constructor(page: PlaywrightPageType, opts?: WebPageOpt) {
    super(page, 'playwright', opts);
  }

  async registerFileChooserListener(
    handler: (
      chooser: import('@midscene/core/device').FileChooserHandler,
    ) => Promise<void>,
  ): Promise<() => void> {
    const page = this.underlyingPage as PlaywrightPageType;

    this.playwrightFileChooserHandler = async (chooser: FileChooser) => {
      await handler({
        accept: async (files: string[]) => {
          await chooser.setFiles(files);
        },
      });
    };

    page.on('filechooser', this.playwrightFileChooserHandler);

    return () => {
      if (this.playwrightFileChooserHandler) {
        page.off('filechooser', this.playwrightFileChooserHandler);
        this.playwrightFileChooserHandler = undefined;
      }
    };
  }
}
