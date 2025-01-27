import type { ElementInfo } from '@/extractor';
import { NodeType } from '@/extractor/constants';
import type { WebPage } from '../../common/page';

export async function getElementsInfo(page: WebPage) {
  const captureElementSnapshot: Array<ElementInfo> =
    await page.getElementsInfo();
  const elementsPositionInfo = captureElementSnapshot.map(
    (elementInfo, index) => {
      return {
        label: elementInfo.indexId,
        x: elementInfo.rect.left,
        y: elementInfo.rect.top,
        width: elementInfo.rect.width,
        height: elementInfo.rect.height,
        attributes: elementInfo.attributes,
      };
    },
  );
  const elementsPositionInfoWithoutText = elementsPositionInfo.filter(
    (elementInfo) => {
      if (elementInfo.attributes.nodeType === NodeType.TEXT) {
        return false;
      }
      return true;
    },
  );
  return {
    elementsPositionInfo,
    captureElementSnapshot,
    elementsPositionInfoWithoutText,
  };
}
