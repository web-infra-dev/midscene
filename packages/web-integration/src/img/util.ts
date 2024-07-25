import { getElementInfosFromPage } from '../common/utils';
import { NodeType } from '@/extractor/constants';
import { ElementInfo } from '@/extractor/extractor';

export async function getElementInfos(page: any) {
  const captureElementSnapshot: Array<ElementInfo> = await getElementInfosFromPage(page);
  const elementsPositionInfo = captureElementSnapshot.map((elementInfo) => {
    return {
      label: elementInfo.id.toString(),
      x: elementInfo.rect.left,
      y: elementInfo.rect.top,
      width: elementInfo.rect.width,
      height: elementInfo.rect.height,
      attributes: elementInfo.attributes,
    };
  });
  const elementsPositionInfoWithoutText = elementsPositionInfo.filter((elementInfo) => {
    if (elementInfo.attributes.nodeType === NodeType.TEXT) {
      return false;
    }
    return true;
  });
  return {
    elementsPositionInfo,
    captureElementSnapshot,
    elementsPositionInfoWithoutText,
  };
}
