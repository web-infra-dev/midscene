export {
  createLocateResultAdapter,
  resolveLocateResultCoordinates,
} from './factory';
export { createCoordinateDistanceToPixels } from './coordinate-distance';
export type { CoordinateDistanceAxis } from './coordinate-distance';
export { unwrapCoordinateListLikeInput } from './parse';
export type {
  LocateResultBbox,
  PixelBbox,
  RawLocateValue,
  SectionLocatePixelBboxGroup,
  CustomLocateResultAdapterDefinition,
  LocateResultAdapter,
  LocateResultAdapterDefinition,
  LocateResultCoordinates,
  LocateResultContext,
  LocateResultShape,
  LocateResultPromptSpec,
  LocateResultValue,
  NonEmptyArray,
  ResolvedLocateResultCoordinates,
  StandardLocateResultAdapterDefinition,
} from './types';
