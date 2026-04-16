import type { DeviceAction } from '@midscene/core';
import type { ZodObjectSchema, ZodRuntimeAccess } from '../types';
import { isLocateField, isZodObjectSchema, unwrapZodType } from '../types';
import { apiMetadata } from './constants';

export interface InlineStructuredFieldConfig {
  name: string;
  placeholder?: string;
}

/**
 * Compute the list of action identifiers that should be offered in the prompt
 * input's action dropdown.
 *
 * Inclusion rules:
 *   - If `actionSpace` is empty/undefined, fall back to the full metadata set
 *     so dry-mode / offline renderers still show something to pick from.
 *   - `aiAct` is included **only when the current `actionSpace` exposes it**.
 *     It is the universal "natural-language" action and usually lives in every
 *     device's action space, but we intentionally do not force-inject it —
 *     devices that truly cannot run `aiAct` should not see a broken entry.
 *   - `extraction` and `validation` APIs are kept even when not in the device's
 *     `actionSpace`: they are executed against the captured UI context rather
 *     than being dispatched to the device, so they apply universally.
 *   - All remaining `actionSpace` entries are included verbatim (device-specific
 *     actions surface automatically).
 */
export const getAvailablePromptActionTypes = (
  actionSpace: DeviceAction<any>[] | undefined,
): string[] => {
  const metadataMethods = Object.keys(apiMetadata);

  if (!actionSpace?.length) {
    return metadataMethods;
  }

  const availableMethods = actionSpace.map(
    (action) => action.interfaceAlias || action.name,
  );
  const supportsAiAct = availableMethods.includes('aiAct');
  const finalMethods = new Set<string>();

  metadataMethods.forEach((method) => {
    const methodInfo = apiMetadata[method as keyof typeof apiMetadata];

    if (method === 'aiAct') {
      if (supportsAiAct) finalMethods.add(method);
      return;
    }

    if (
      methodInfo?.group === 'extraction' ||
      methodInfo?.group === 'validation'
    ) {
      finalMethods.add(method);
      return;
    }

    if (availableMethods.includes(method)) {
      finalMethods.add(method);
    }
  });

  availableMethods.forEach((method) => {
    finalMethods.add(method);
  });

  return Array.from(finalMethods);
};

export const getInlineStructuredFieldConfig = (
  actionSpace: DeviceAction<any>[] | undefined,
  selectedType: string,
): InlineStructuredFieldConfig | null => {
  if (!actionSpace?.length || !selectedType) {
    return null;
  }

  const action = actionSpace.find(
    (item) =>
      item.interfaceAlias === selectedType || item.name === selectedType,
  );

  if (!action?.paramSchema || !isZodObjectSchema(action.paramSchema)) {
    return null;
  }

  const schema = action.paramSchema as ZodObjectSchema;
  const shape = schema.shape || {};
  const keys = Object.keys(shape);

  if (keys.length !== 1) {
    return null;
  }

  const [name] = keys;
  const field = shape[name];
  const { actualField } = unwrapZodType(field);
  const isLocate = isLocateField(actualField);
  const fieldType = (actualField as ZodRuntimeAccess)._def?.typeName;
  const isInlineField = fieldType === 'ZodString' || isLocate;

  if (!isInlineField) {
    return null;
  }

  const placeholder =
    (actualField as ZodRuntimeAccess)._def?.description ||
    (actualField as ZodRuntimeAccess).description ||
    (isLocate
      ? 'Describe the element you want to interact with'
      : `Enter ${name}`);

  return {
    name,
    placeholder,
  };
};
