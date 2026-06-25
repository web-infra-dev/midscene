import { getPreferredLanguage } from '@midscene/shared/env';
import type { AIArgs } from '../types';

export const DESCRIBE_ELEMENT_PRIMITIVES = [
  'text',
  'icon',
  'arrow',
  'input',
  'dropdown',
  'option',
  'button',
  'link',
  'status',
  'checkbox',
  'radio',
  'switch',
  'tab',
  'menuitem',
  'slider',
  'image',
  'control',
  'region',
  'blank',
  'unknown',
] as const;

export type DescribeElementPrimitive =
  (typeof DESCRIBE_ELEMENT_PRIMITIVES)[number];

export const TEXT_LIKE_DESCRIBE_ELEMENT_PRIMITIVES = [
  'text',
  'link',
  'status',
] as const satisfies readonly DescribeElementPrimitive[];

const describeElementPrimitiveText = DESCRIBE_ELEMENT_PRIMITIVES.join(' | ');
const diagnosticCenterPrimitiveText = describeElementPrimitiveText;

type DescribeRetryDiagnosticPromptInput = {
  previousDescription: string;
  previousStructuredDescriptor?: Record<string, string | undefined>;
  verifierResult?: unknown;
  verifierError?: string;
  diagnosticScreenshotBase64: string;
  rawCenterCropBase64: string;
  hasLocatorMarker: boolean;
};

export type DescribeRetryDiagnosticFailureType =
  | 'neighbor-or-similar-element'
  | 'table-context-mismatch'
  | 'no-locator-result'
  | 'over-broad-description'
  | 'unknown';

export type DiagnosticRetryHintInput = {
  failureType?: DescribeRetryDiagnosticFailureType;
  centerPrimitive?: DescribeElementPrimitive;
  glyph?: string;
  primitiveEvidence?: string;
  describeInstruction?: string;
  locateInstruction?: string;
};

const examplesMap: Record<string, string[]> = {
  Chinese: [
    '"登录表单中的"登录"按钮"',
    '"搜索输入框，placeholder 为"请输入关键词""',
    '"顶部导航栏中文字为"首页"的链接"',
    '"联系表单中的提交按钮"',
    '"aria-label 为"打开菜单"的菜单图标"',
    '"左侧导航栏中当前分组标题右侧的折叠图标"',
  ],
  English: [
    '"Login button with text \'Sign In\'"',
    '"Search input with placeholder \'Enter keywords\'"',
    '"Navigation link with text \'Home\' in header"',
    '"Submit button in contact form"',
    '"Menu icon with aria-label \'Open menu\'"',
    '"Collapse icon to the right of the current section title in the left sidebar"',
  ],
};

const getExamples = (language: string) => {
  const examples = examplesMap[language] || examplesMap.English;
  return examples.map((e) => `- ${e}`).join('\n');
};

export const getDiagnosticFailureHint = (
  failureType?: DescribeRetryDiagnosticFailureType,
): string => {
  switch (failureType) {
    case 'table-context-mismatch':
      return 'The previous locator likely matched the same kind of item in the wrong repeated context. Re-read marker 1, identify its local UI region, and use only anchors visibly supported around marker 1. For tables/lists/grids, prefer readable local anchors over guessed row, column, or ordinal positions.';
    case 'neighbor-or-similar-element':
      return 'The previous locator likely matched a nearby or visually similar element. Treat that previous match as wrong context only. If the target and wrong match are adjacent tiny icons or controls in the same local group, disambiguate with local order or relative position inside that group.';
    case 'over-broad-description':
      return 'The previous locator likely matched a larger parent, row, line, group, or container. Describe the exact primitive at marker 1 instead of the parent.';
    case 'no-locator-result':
      return 'The locator did not return a usable target for the previous description. Make the target primitive and local owner/context tighter so the next locator call can find marker 1.';
    default:
      return 'The previous description did not verify against marker 1. Re-read marker 1 from the diagnostic crop, ignore marker 2 as the target, and produce a target-first description for the smallest real UI part at marker 1.';
  }
};

export const buildDiagnosticRetryHint = (
  input: DiagnosticRetryHintInput,
): string => {
  const primitive = [input.glyph, input.centerPrimitive]
    .filter(Boolean)
    .join(' ')
    .trim();

  return [
    'A visual diagnostic inspected the callout endpoint crop.',
    primitive
      ? `The endpoint appears to be ${primitive}.`
      : 'Re-check the real UI part at the endpoint itself.',
    getDiagnosticFailureHint(input.failureType),
    input.describeInstruction,
    input.locateInstruction
      ? `Locator-oriented constraint: ${input.locateInstruction}`
      : undefined,
    'Do not mention diagnostic marker numbers, marker colors, callout colors, boxes, ellipse, lines, or annotation overlays in the new description.',
    'Nearby text, icons, rows, or controls are context only; describe the smallest real UI part at the endpoint.',
    'For tiny or icon-only controls next to similar controls, include local order or relative position within the same group when it distinguishes the endpoint from the wrong match.',
    'If the endpoint is on a field value, label, input body, dropdown/select body, or dropdown current value, do not retarget to a trailing icon, dropdown arrow, clear button, or search affordance in the same control.',
    'If the endpoint is inside a bordered input/select/dropdown/filter field body or blank area, describe that field body/current value/control. Use primitive dropdown for select/combobox/dropdown triggers or current-value areas. Do not snap to a trailing icon or a nearby table header unless the endpoint is directly on that glyph/text.',
  ]
    .filter(Boolean)
    .join('\n');
};

export const elementDescriberInstruction = () => {
  const preferredLanguage = getPreferredLanguage();

  return `
Describe the real page element indicated by the temporary callout.
The callout is an annotation overlay. It is not part of the page or target.
The description will be used later to locate the same element on the original screenshot without annotations, so write a locator-style description instead of a visual caption.

IMPORTANT: You MUST write the description in ${preferredLanguage}.

OBSERVE IN THIS ORDER:
1. Target first: identify the smallest real UI part at the callout endpoint/center: text, glyph, icon, arrow, input, dropdown/select, option, button, link, status, checkbox, radio, switch, tab, menu item, slider, image, control, or empty region.
2. Primitive: name what that smallest part is before adding surrounding context.
3. Owner/context: add the nearest stable owner only when it helps disambiguate, such as a label, row/card title, column header, field name, or adjacent visible text.
4. Similar candidates: if multiple candidates look similar, add stable local anchors from the same row, card, field, header, or group. Prefer visible text and values over inferred row counting or temporary visual state.

RULES:
- Keep description under 35 words.
- Describe the smallest indicated UI part itself, not the larger container, row, card, sentence, or group that merely contains it.
- Ignore every annotation overlay, including callout number, line, color, marker, border, dot, ring, crosshair, or selection box. Never describe the annotation as the target.
- Do not borrow the text, glyph, direction, purpose, or state from a nearby element outside the callout endpoint/center.
- For tiny or icon-only controls, name the visible glyph/control and add its owner/context; adjacent text is context, not the target. If similar tiny controls are adjacent in the same group, add local order or relative position inside that group.
- If the endpoint/center is on a field value, label, or input body, describe that value/field/control. Do not retarget to a trailing icon, dropdown arrow, clear button, or search affordance unless the endpoint/center is on that icon itself.
- If the endpoint/center is inside the bordered body, current value, trigger, or blank area of a select/dropdown/combobox/filter field, use primitive "dropdown" and describe that dropdown/select control. Do not call it an input unless it is clearly a free-text field.
- If the endpoint/center is inside the bordered body or blank area of an input or filter field, describe the field body/current value/control even when the visible text is not exactly under the endpoint. Use the field label or visible value as context; do not snap to trailing icons or nearby table headers.
- If the endpoint/center is on an expanded dropdown/select/menu list item, use primitive "option" for selectable list options or "menuitem" for command menu entries.
- Only use primitive "icon" or "arrow" when the endpoint/center directly overlaps the real glyph strokes. A nearby search icon, dropdown arrow, clear button, or wrong locator result must not become the target primitive.
- For compound controls or stacked glyphs, describe only the sub-part containing the callout endpoint/center, using upper/lower or left/right only when visible.
- For inline text, links, or substrings, describe only the exact substring/link at the endpoint/center, not the whole line.
- For repeated rows, cards, or options, use same-local anchors that are visible in the screenshot, such as neighboring cell text, field value, title, date, time, ID, or column/header label.
- For tables or grids, describe the target as the intersection of the target column/header and same-row anchors. Do not use row ordinals or column ordinals unless the index/header is clearly visible.
- Use selected, highlighted, hovered, focused, or active state only if the callout endpoint/center is inside that state.
- If the endpoint/center is on blank space, describe the empty region/gap between stable surrounding anchors. Do not invent a nearby control.
- Use actual visible text from the current screenshot when available; do not copy labels from the examples.
- **Write the description in ${preferredLanguage}**

EXAMPLES:
${getExamples(preferredLanguage)}

Return JSON:
{
  "target": "the smallest indicated UI part itself, including visible text/icon/control type when identifiable",
  "primitive": "${describeElementPrimitiveText}",
  "owner": "nearest stable owner text, label, group, row, or column context",
  "disambiguator": "same-owner anchor, visible index, sub-part, position, or empty string",
  "context": "stable owner, row/column, neighboring text, or adjacent controls that disambiguate the target",
  "description": "unique element identifier",
  "error"?: "error message if any"
}`;
};

const DIAGNOSTIC_TASK_RULES = [
  'You are a visual diagnostic assistant for a UI element description retry.',
  'First re-identify the real primitive at marker 1 from the raw center crop, then classify why the previous locator description failed and prescribe retry constraints.',
  'Do not write the final locator description.',
  'Do not infer from hidden GT boxes; you only see the diagnostic screenshot, target marker, previous locator marker if available, raw center crop, previous description, and verifier result.',
];

const DIAGNOSTIC_MARKER_RULES = [
  'Marker 1 is the target endpoint that the next description must describe.',
  'Marker 1 is the context center. First identify the smallest real UI primitive at marker 1, then identify the local continuous UI region around marker 1 for owner/context.',
  'Marker 2, when present, is the failed locator result for the previous description. It is not an alternative target and must not become the context center.',
  'Use marker 2 only to understand what failed and what to avoid. Do not let marker 2 text, glyph, primitive, owner, row, column, or local region override marker 1 evidence.',
  'If marker 1 and marker 2 are in different local UI regions, keep primitive, owner, context, describeInstruction, and locateInstruction anchored to marker 1 region. Mention marker 2 only in wrongMatchSummary.',
  'Use the raw center crop as the primary evidence for marker 1 primitive. It has no diagnostic overlay and should be read before the full diagnostic screenshot.',
  'Use the full diagnostic screenshot only after primitive recognition, to compare marker 1 against marker 2 and nearby context.',
  'Prioritize marker 1 and its raw center crop: identify the smallest real UI primitive at marker 1 before considering owner/context or the previous description.',
  'Cross-check the raw center crop against the full screenshot context before prescribing a retry.',
  'Marker 1 may be drawn as a callout with a hollow ellipse around the target. Treat the callout, ellipse, color, and line as overlay only.',
];

const DIAGNOSTIC_FAILED_HYPOTHESIS_RULES = [
  'Treat the previous description and structured descriptor as an untrusted failed hypothesis. Their target text, glyph, owner, and row/context anchors may be wrong.',
  'Use only text, glyphs, row context, and owner context that are visibly supported around marker 1 when prescribing new anchors.',
  'If the visible text or glyph at marker 1 differs from the previous descriptor, correct it in describeInstruction and locateInstruction. Do not preserve the previous target text by default.',
];

const DIAGNOSTIC_FAILURE_ROUTING_RULES = [
  'Route the failure into exactly one of the four classes when confident: neighbor-or-similar-element, table-context-mismatch, no-locator-result, over-broad-description.',
  'Use neighbor-or-similar-element when marker 2 is a nearby or visually similar candidate but marker 1 is clear.',
  'Use table-context-mismatch when marker 2 matches the same kind of text/status/control in the wrong row, list item, card, menu option, or table context.',
  'Use no-locator-result only when marker 2 is absent or the verifier error says the locator returned no usable target. Do not use it as a generic fallback when marker 2 points to a wrong element.',
  'Use over-broad-description when marker 2 covers a parent container, row, line, group, or larger region instead of the exact primitive at marker 1.',
  'Only use failureType "neighbor-or-similar-element" when marker 1 primitive and local owner/context are both clear enough to distinguish the target from marker 2 or other nearby candidates.',
];

const DIAGNOSTIC_TABLE_RULES = [
  'Before using table/list/grid context, decide which local UI region marker 1 belongs to; similar text in another region is background context, not an anchor.',
  'For repeated row/list/grid values, use two visible local anchors when possible: the target column/header or group identity, plus a same-row/item anchor near marker 1.',
  'Use row numbers, column numbers, or ordinal positions only when they are clearly visible and unambiguous around marker 1; otherwise prefer readable local anchors or report uncertainty.',
  'Every anchor used in describeInstruction or locateInstruction must be visibly supported around marker 1. If an anchor only comes from the failed previous description, omit it.',
];

const DIAGNOSTIC_FIELD_AND_ICON_RULES = [
  'Before classifying marker 1 as an icon, verify from the raw center crop that the endpoint clearly overlaps the real glyph strokes of that icon. Nearby glyphs, trailing icons in the same field, or icon-shaped marker overlays are not enough.',
  'If marker 1 is inside a select/dropdown/combobox/filter trigger, current value, field body, or blank field area, prefer dropdown, input, text, control, or blank according to the real target. Use dropdown for select/combobox/dropdown controls. Do not snap to a trailing search/dropdown/clear icon.',
  'If marker 1 is on an expanded dropdown/select/menu list item, use option for selectable values or menuitem for command entries.',
  'If marker 2 is a trailing icon but marker 1 has no raw-crop glyph evidence, treat marker 2 as the wrong match. describeInstruction and locateInstruction must not repeat the previous icon target.',
];

const DIAGNOSTIC_TINY_AND_TEXT_RULES = [
  'When marker 1 and marker 2 are adjacent tiny icons or controls in the same compact group, use neighbor-or-similar-element and prescribe local order or relative position within that group, not just the shared owner text.',
  'For wrapped inline links or text, prescribe a tight visible segment of the target text instead of the whole wrapped sentence or whole multi-line link. For CJK link labels, the first 2-4 visible characters are enough when unique.',
];

const DIAGNOSTIC_RESPONSE_RULES = [
  'If marker 1 is ambiguous, partially occluded, too zoomed-in, or conflicts with the full screenshot context, do not guess a glyph. Return failureType "unknown", confidence <= 0.5, centerPrimitive "unknown", and isPrimitiveConsistentWithContext false.',
  'primitiveEvidence must briefly cite what is visible in the raw center crop that supports centerPrimitive. If centerPrimitive is icon, primitiveEvidence must mention the visible glyph strokes at marker 1.',
  'Keep describeInstruction short and target-first. Do not repeat long details about the wrong match; wrongMatchSummary is for logging only.',
  'describeInstruction and locateInstruction must describe marker 1 and its local UI region. Do not copy marker 2-only text, glyphs, rows, columns, or region context into retry instructions.',
  'In describeInstruction and locateInstruction, describe only real UI content. Never mention diagnostic marker numbers, marker colors, callout colors, colored boxes, hollow ellipse, lines, borders, or annotation overlays.',
  'If color is part of the real UI, mention it only when it is visibly on the UI element itself, not from marker 1/2 or the diagnostic overlay.',
  'Return JSON only with keys: failureType, confidence, centerPrimitive, primitiveEvidence, glyph, isPrimitiveConsistentWithContext, uncertaintyReason, wrongMatchSummary, describeInstruction, locateInstruction.',
  'Allowed failureType values: neighbor-or-similar-element, table-context-mismatch, no-locator-result, over-broad-description, unknown.',
  `Allowed centerPrimitive values: ${diagnosticCenterPrimitiveText}.`,
];

const buildDescribeRetryDiagnosticSystemPrompt = () =>
  [
    ...DIAGNOSTIC_TASK_RULES,
    ...DIAGNOSTIC_MARKER_RULES,
    ...DIAGNOSTIC_FAILED_HYPOTHESIS_RULES,
    ...DIAGNOSTIC_FAILURE_ROUTING_RULES,
    ...DIAGNOSTIC_TABLE_RULES,
    ...DIAGNOSTIC_FIELD_AND_ICON_RULES,
    ...DIAGNOSTIC_TINY_AND_TEXT_RULES,
    ...DIAGNOSTIC_RESPONSE_RULES,
  ].join('\n');

export const buildDescribeRetryDiagnosticPrompt = (
  input: DescribeRetryDiagnosticPromptInput,
): AIArgs => [
  {
    role: 'system',
    content: buildDescribeRetryDiagnosticSystemPrompt(),
  },
  {
    role: 'user',
    content: [
      {
        type: 'text' as const,
        text: [
          'Step 1: Inspect the raw center crop first.',
          'Decide the real primitive at marker 1 from the unannotated pixels.',
          'Do not use the previous description to decide this primitive.',
        ].join('\n'),
      },
      {
        type: 'image_url' as const,
        image_url: {
          url: input.rawCenterCropBase64,
          detail: 'high',
        },
      },
      {
        type: 'text' as const,
        text: [
          'Step 2: Use the diagnostic screenshot only to compare marker 1 against the previous locator result.',
          'Marker 1 = target endpoint to describe.',
          input.hasLocatorMarker
            ? 'Marker 2 = previous locator result for the current description. Because verification failed, treat marker 2 as wrong, biased, too broad, or insufficient relative to marker 1.'
            : 'Marker 2 is absent because the locator did not return a usable result.',
        ].join('\n'),
      },
      {
        type: 'image_url' as const,
        image_url: {
          url: input.diagnosticScreenshotBase64,
          detail: 'high',
        },
      },
      {
        type: 'text' as const,
        text: [
          'Step 3: Inspect the failed hypothesis and verifier result. Treat them as wrong until the raw crop and marker 1 support them.',
          `Previous description: ${input.previousDescription}`,
          input.previousStructuredDescriptor
            ? `Previous structured descriptor: ${JSON.stringify(input.previousStructuredDescriptor)}`
            : '',
          input.verifierResult
            ? `Verifier result: ${JSON.stringify(input.verifierResult)}`
            : 'Verifier result: unavailable',
          input.verifierError ? `Verifier error: ${input.verifierError}` : '',
        ]
          .filter(Boolean)
          .join('\n'),
      },
    ],
  },
];
