import { AppiumPage } from '@/appium';
import type { Capabilities } from '@wdio/types';
import { remote } from 'webdriverio';

export async function launchPage(
  opt: Capabilities.WebdriverIOConfig,
): Promise<AppiumPage> {
  const driver = await remote(opt);

  return new AppiumPage(driver);
}
