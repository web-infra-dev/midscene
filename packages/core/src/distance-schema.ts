import { z } from 'zod';

export type DistanceUnit = 'model-input-image-pixel' | 'device-logical';

/** Spatial semantics only. Values remain numbers in both API and model inputs. */
export function getMidsceneDistanceSchema() {
  const schema = z.number();
  Object.assign(schema._def, { midsceneDistance: true });
  return schema;
}

function isDistanceField(schema: z.ZodTypeAny): boolean {
  const def = schema._def;
  if (def.midsceneDistance !== undefined) {
    return def.midsceneDistance === true;
  }
  if (def.innerType) {
    return isDistanceField(def.innerType);
  }
  return false;
}

export function findDistanceFields(schema?: z.ZodTypeAny) {
  if (!schema || schema._def.typeName !== 'ZodObject') {
    return [];
  }
  return Object.entries((schema as z.AnyZodObject).shape)
    .filter(([, field]) => isDistanceField(field as z.ZodTypeAny))
    .map(([name]) => name);
}
