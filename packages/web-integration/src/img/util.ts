import { getElementInfosFromPage } from '../playwright/utils';
import { NodeType } from '@/html-element/constants';
import { ElementInfo } from '@/html-element/extractInfo';

export async function getElementInfos(page: any) {
  const captureElementSnapshot: Array<ElementInfo> = await getElementInfosFromPage(page);
  const elementsPostionInfo = captureElementSnapshot.map((elementInfo) => {
    return {
      label: elementInfo.id.toString(),
      x: elementInfo.rect.left,
      y: elementInfo.rect.top,
      width: elementInfo.rect.width,
      height: elementInfo.rect.height,
      attributes: elementInfo.attributes,
    };
  });
  const elementsPostionInfoWithoutText = elementsPostionInfo.filter((elementInfo) => {
    if (elementInfo.attributes.nodeType === NodeType.TEXT) {
      return false;
    }
    return true;
  });
  return {
    elementsPostionInfo,
    captureElementSnapshot,
    elementsPostionInfoWithoutText,
  };
}
