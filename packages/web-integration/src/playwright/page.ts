import type { FileChooser, Page as PlaywrightPageType } from 'playwright';
import { Page as BasePage } from '../puppeteer/base-page';
import type { WebPageOpt } from '../web-element';

export class WebPage extends BasePage<'playwright', PlaywrightPageType> {
  private playwrightFileChooserHandler?: (
    chooser: FileChooser,
  ) => Promise<void>;

  constructor(page: PlaywrightPageType, opts?: WebPageOpt) {
    super(page, 'playwright', opts);
  }

  async registerFileChooserListener(
    handler: (
      chooser: import('@midscene/core/device').FileChooserHandler,
    ) => Promise<void>,
  ): Promise<{ dispose: () => void; getError: () => Error | undefined }> {
    const page = this.underlyingPage as PlaywrightPageType;

    let capturedError: Error | undefined;

    this.playwrightFileChooserHandler = async (chooser: FileChooser) => {
      try {
        await handler({
          accept: async (files: string[]) => {
            // Check if input has webkitdirectory attribute
            const element = chooser.element();
            const hasWebkitDirectory = await element.evaluate((el) => {
              if (el instanceof HTMLInputElement) {
                return (
                  el.hasAttribute('webkitdirectory') ||
                  el.hasAttribute('directory')
                );
              }
              return false;
            });

            if (hasWebkitDirectory) {
              throw new Error(
                'File upload is not supported for directory inputs (inputs with webkitdirectory or directory attribute). Please use regular file inputs instead.',
              );
            }

            await chooser.setFiles(files);
          },
        });
      } catch (error) {
        capturedError = error as Error;
      }
    };

    page.on('filechooser', this.playwrightFileChooserHandler);

    return {
      dispose: () => {
        if (this.playwrightFileChooserHandler) {
          page.off('filechooser', this.playwrightFileChooserHandler);
          this.playwrightFileChooserHandler = undefined;
        }
      },
      getError: () => capturedError,
    };
  }
}
