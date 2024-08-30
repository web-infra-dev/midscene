import { NodeType } from '@/extractor/constants';
import type { ElementInfo } from '@/extractor/extractor';
import { getElementInfosFromPage } from '../../common/utils';

export async function getElementInfos(page: any) {
  const captureElementSnapshot: Array<ElementInfo> =
    await getElementInfosFromPage(page);
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
