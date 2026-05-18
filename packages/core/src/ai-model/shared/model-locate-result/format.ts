import type {
  LocateResultFormatPreset,
  LocateResultResponseFormat,
  LocateResultValue,
} from './types';

const defaultBboxLocateResultFormatDescriptor = '2d bounding box';
const defaultPointLocateResultFormatDescriptor = 'point';

function defaultLocateResultFormatDescriptorForResultType(
  resultType: LocateResultValue['type'],
) {
  return resultType === 'point'
    ? defaultPointLocateResultFormatDescriptor
    : defaultBboxLocateResultFormatDescriptor;
}

export function resolveLocateResultResponseFormat(
  format: LocateResultFormatPreset,
  locateResultFormatDescriptor?: string,
): LocateResultResponseFormat {
  switch (format) {
    case 'bbox-normalized-0-1000-xyxy':
      return {
        resultType: 'bbox',
        coordinateSystem: 'normalized-0-1000',
        coordinateOrder: 'xyxy',
        locateResultFormatDescriptor:
          locateResultFormatDescriptor ||
          defaultLocateResultFormatDescriptorForResultType('bbox'),
      };
    case 'bbox-normalized-0-1000-yxyx':
      return {
        resultType: 'bbox',
        coordinateSystem: 'normalized-0-1000',
        coordinateOrder: 'yxyx',
        locateResultFormatDescriptor:
          locateResultFormatDescriptor ||
          defaultLocateResultFormatDescriptorForResultType('bbox'),
      };
    case 'bbox-actual-pixel-xyxy':
      return {
        resultType: 'bbox',
        coordinateSystem: 'actual-pixel',
        coordinateOrder: 'xyxy',
        locateResultFormatDescriptor:
          locateResultFormatDescriptor ||
          defaultLocateResultFormatDescriptorForResultType('bbox'),
      };
    case 'point-normalized-0-1000-xy':
      return {
        resultType: 'point',
        coordinateSystem: 'normalized-0-1000',
        locateResultFormatDescriptor:
          locateResultFormatDescriptor ||
          defaultLocateResultFormatDescriptorForResultType('point'),
      };
    case 'point-actual-pixel-xy':
      return {
        resultType: 'point',
        coordinateSystem: 'actual-pixel',
        locateResultFormatDescriptor:
          locateResultFormatDescriptor ||
          defaultLocateResultFormatDescriptorForResultType('point'),
      };
    default:
      throw new Error(`Unknown locate result format: ${format}`);
  }
}
