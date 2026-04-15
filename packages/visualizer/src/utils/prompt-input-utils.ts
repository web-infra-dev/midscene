import type { DeviceAction } from '@midscene/core';
import type { ZodObjectSchema, ZodRuntimeAccess } from '../types';
import { isLocateField, isZodObjectSchema, unwrapZodType } from '../types';
import { apiMetadata } from './constants';

export interface InlineStructuredFieldConfig {
  name: string;
  placeholder?: string;
}

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
  const finalMethods = new Set<string>();

  metadataMethods.forEach((method) => {
    const methodInfo = apiMetadata[method as keyof typeof apiMetadata];

    if (
      method === 'aiAct' ||
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
