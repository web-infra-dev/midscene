import { inspect } from 'node:util';

export {
  SiwcError,
  withSiwcStage,
  tokenResponseError,
} from '@midscene/core/ai-model';

export function describeSiwcError(error: unknown): string {
  return inspect(error, {
    depth: null,
    colors: false,
    maxArrayLength: null,
    maxStringLength: null,
  });
}
