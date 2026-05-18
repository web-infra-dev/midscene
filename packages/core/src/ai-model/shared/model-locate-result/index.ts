export { createLocateResultAdapter } from './factory';
export {
  unwrapBboxLikeInput,
  mapNormalized01000XyxyToActualPixelBbox,
  expandNormalized01000PointToBbox,
} from './normalize';
export type {
  Bbox,
  LocateResultAdapter,
  LocateResultAdapterDefinition,
  LocateResultContext,
  LocateResultExtractor,
  LocateResultExtractorPreset,
  LocateResultFormatPreset,
  LocateResultResponseFormat,
  LocateResultValue,
} from './types';
