import type { ServiceExtractParam } from '@/types';

export function buildTypeQueryDemandValue(
  type: 'Boolean' | 'Number' | 'String' | 'Assert' | 'WaitFor',
  demand: ServiceExtractParam,
) {
  const currentScreenshotConstraint =
    'based on the current screenshot and its contents if provided, unless the user explicitly asks to compare with reference images';

  if (type === 'Assert') {
    return `Boolean, ${currentScreenshotConstraint}, whether the following statement is true: ${demand}`;
  }

  if (type === 'WaitFor') {
    return `Boolean, the user wants to do some 'wait for' operation. ${currentScreenshotConstraint}, please check whether the following statement is true: ${demand}`;
  }

  return `${type}, ${currentScreenshotConstraint}, ${demand}`;
}

export const extractDataQueryPrompt = (
  pageDescription: string,
  dataQuery: string | Record<string, string>,
  context?: string,
) => {
  const dataQueryText =
    typeof dataQuery === 'string'
      ? dataQuery
      : JSON.stringify(dataQuery, null, 2);

  const trimmedContext = context?.trim();
  const contextSection = trimmedContext ? `\n${trimmedContext}\n` : '';

  return `
<PageDescription>
${pageDescription}
</PageDescription>
${contextSection}
<DATA_DEMAND>
${dataQueryText}
</DATA_DEMAND>
  `;
};
