import { ERROR_CODE_NOT_IMPLEMENTED_AS_DESIGNED } from '../common/utils';
import { ChromeExtensionProxyPageAgent } from './agent';
import { ChromeExtensionPageBrowserSide } from './bridge-page-browser-side';
import ChromeExtensionProxyPage from './page';
// import { getBridgePageInCliSide } from './bridge-page-cli-side';

export {
  // getBridgePageInCliSide,
  ChromeExtensionProxyPage,
  ChromeExtensionProxyPageAgent,
  ChromeExtensionPageBrowserSide,
  ERROR_CODE_NOT_IMPLEMENTED_AS_DESIGNED,
};
