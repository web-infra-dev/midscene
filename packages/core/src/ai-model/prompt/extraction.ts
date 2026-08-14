import type { ServiceExtractParam } from '@/types';
import { getPreferredLanguage } from '@midscene/shared/env';

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

export function systemPromptToExtract(options?: {
  screenshotIncluded?: boolean;
  referenceImagesIncluded?: boolean;
}) {
  const preferredLanguage = getPreferredLanguage();
  const screenshotIncluded = options?.screenshotIncluded ?? true;
  const referenceImagesIncluded = options?.referenceImagesIncluded ?? false;

  const evidenceSourcePrompts: string[] = [];

  if (screenshotIncluded) {
    evidenceSourcePrompts.push(
      'The user will provide a current screenshot to evaluate, and may provide its contents. Base your answer on the current screenshot and its contents when provided. Treat them as the primary source of truth for what is currently visible or true.',
    );
  } else {
    evidenceSourcePrompts.push(
      'The user will not provide a current screenshot. Use only the supplied page contents and other inputs, and do not infer unsupported visual details.',
    );
  }

  if (referenceImagesIncluded) {
    const referenceImagesPrompt =
      'Reference images are supporting context only unless <DATA_DEMAND> explicitly asks for comparison, matching, or reasoning about them.';
    evidenceSourcePrompts.push(
      screenshotIncluded
        ? `${referenceImagesPrompt} Do not conclude that something exists in the current screenshot solely because it appears in a reference image; when they conflict, trust the current screenshot and its contents.`
        : `${referenceImagesPrompt} Do not treat reference images as direct evidence of the current state unless the demand explicitly asks you to use them that way.`,
    );
  }
  const evidenceSourcePrompt = evidenceSourcePrompts.join('\n\n');

  return `
Your task is to understand the data requirements in <DATA_DEMAND> and extract the requested structured data from the provided UI evidence.


${evidenceSourcePrompt}

If a key specifies a JSON data type (such as Number, String, Boolean, Object, Array), ensure the returned value strictly matches that data type.

When DATA_DEMAND is a JSON object, the keys in your response must exactly match the keys in DATA_DEMAND. Do not rename, translate, or substitute any key.

The <observation> should briefly explain the observed evidence, the necessary reasoning, and the preliminary conclusion used for data extraction.

If multiple candidate answers appear reasonable, briefly compare them and state the criterion used to select the final answer.

The reasoning should progress linearly and decisively toward a conclusion. Once the available evidence is sufficient to support a conclusion, stop further deliberation and proceed to <data-json>.

Do not repeatedly reconsider the same candidate answers, repeat the same calculation, ask yourself rhetorical questions, or overturn a well-supported conclusion without new evidence.

Keep the <observation> concise: use no more than five sentences and fewer than 300 words.


Return in the following XML format:
<observation>brief evidence, necessary reasoning, and the preliminary conclusion used for the extraction. Use ${preferredLanguage} in this field.</observation>
<data-json>the extracted data as JSON. Make sure both the value and scheme meet the DATA_DEMAND. If you want to write some description in this field, use the same language as the DATA_DEMAND.</data-json>
<errors>optional error messages as JSON array, e.g., ["error1", "error2"]</errors>

# Example 1
For example, if the DATA_DEMAND is:

<DATA_DEMAND>
{
  "name": "name shows on the left panel, string",
  "age": "age shows on the right panel, number",
  "isAdmin": "if the user is admin, boolean"
}
</DATA_DEMAND>

By viewing the screenshot and page contents, you can extract the following data:

<observation>According to the screenshot, i can see ...</observation>
<data-json>
{
  "name": "John",
  "age": 30,
  "isAdmin": true
}
</data-json>

# Example 2
If the DATA_DEMAND is:

<DATA_DEMAND>
the todo items list, string[]
</DATA_DEMAND>

By viewing the screenshot and page contents, you can extract the following data:

<observation>According to the screenshot, i can see ...</observation>
<data-json>
["todo 1", "todo 2", "todo 3"]
</data-json>

# Example 3
If the DATA_DEMAND is:

<DATA_DEMAND>
the page title, string
</DATA_DEMAND>

By viewing the screenshot and page contents, you can extract the following data:

<observation>According to the screenshot, i can see ...</observation>
<data-json>
"todo list"
</data-json>

# Example 4
If the DATA_DEMAND is:

<DATA_DEMAND>
{
  "StatementIsTruthy": "Boolean, is it currently the SMS page?"
}
</DATA_DEMAND>

By viewing the screenshot and page contents, you can extract the following data:

<observation>According to the screenshot, i can see ...</observation>
<data-json>
{ "StatementIsTruthy": true }
</data-json>
`;
}

export const extractDataQueryPrompt = (
  pageDescription: string,
  dataQuery: string | Record<string, string>,
  context?: string,
) => {
  let dataQueryText = '';
  if (typeof dataQuery === 'string') {
    dataQueryText = dataQuery;
  } else {
    dataQueryText = JSON.stringify(dataQuery, null, 2);
  }

  const trimmedContext = context?.trim();
  const contextSection = trimmedContext
    ? `\n<CONTEXT>\n${trimmedContext}\n</CONTEXT>\n`
    : '';

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
