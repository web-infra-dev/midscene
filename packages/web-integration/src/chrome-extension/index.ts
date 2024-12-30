import { ERROR_CODE_NOT_IMPLEMENTED_AS_DESIGNED } from '../common/utils';
import { ChromeExtensionProxyPageAgent } from './agent';
// import { getBridgePageInCliSide } from './bridge-page-cli-side';
import { ChromeExtensionPageBrowserSide } from './bridge-page';
import ChromeExtensionProxyPage from './page';

export {
  // getBridgePageInCliSide,
  ChromeExtensionProxyPage,
  ChromeExtensionProxyPageAgent,
  ChromeExtensionPageBrowserSide,
  ERROR_CODE_NOT_IMPLEMENTED_AS_DESIGNED,
};
