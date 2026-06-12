/**
 * Compile-time tripwire for the hand-mirrored model contract in ./types.
 *
 * The app deliberately consumes injected JSON instead of importing
 * @midscene/bdd build artifacts, so the types are mirrored. This type-only
 * import (erased from the bundle) makes any drift between the two
 * declarations fail this app's `tsc --noEmit` / type-check plugin.
 */
import type { ExploreModel as PackageExploreModel } from '../../../packages/bdd/src/explore/model';
import type { ExploreModel as MirroredExploreModel } from '../src/model/types';

type MutuallyAssignable<A extends B, B extends C, C = A> = true;

export type ExploreModelParity = MutuallyAssignable<
  PackageExploreModel,
  MirroredExploreModel
>;
