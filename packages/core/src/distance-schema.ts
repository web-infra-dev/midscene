import { unwrapZodField } from '@midscene/shared/zod-schema-utils';
import { z } from 'zod';

export type DistanceUnit = 'model-input-image-pixel' | 'device-logical';

/** Spatial semantics only. Values remain numbers in both API and model inputs. */
export function getMidsceneDistanceSchema() {
  const schema = z.number();
  Object.assign(schema._def, { midsceneDistance: true });
  return schema;
}

export function findDistanceFields(schema?: z.ZodTypeAny) {
  if (!schema) {
    return [];
  }
  const unwrapped = unwrapZodField(schema) as z.ZodTypeAny;
  if (unwrapped._def.typeName !== 'ZodObject') {
    return [];
  }
  return Object.entries((unwrapped as z.AnyZodObject).shape)
    .filter(([, field]) => {
      const inner = unwrapZodField(field) as z.ZodTypeAny;
      return inner._def.midsceneDistance === true;
    })
    .map(([name]) => name);
}
