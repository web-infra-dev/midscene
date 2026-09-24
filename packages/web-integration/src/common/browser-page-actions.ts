import { type DeviceAction, z } from '@midscene/core';
import type {
  BrowserAgentPageSelector,
  BrowserAgentPageSummary,
  BrowserPageManager,
} from './browser-agent';

const pageListSize = 8;
const maxListTitleLength = 120;
const maxListUrlLength = 512;

const normalizeFeedbackValue = (value: string) =>
  value.replace(/\s+/g, ' ').trim();

const truncateFeedbackValue = (value: string, maxLength: number) => {
  if (maxLength <= 0) {
    return '';
  }
  if (value.length <= maxLength) {
    return value;
  }
  if (maxLength <= 2) {
    return `${value.slice(0, maxLength - 1)}…`;
  }
  const headLength = Math.ceil(((maxLength - 1) * 2) / 3);
  const tailLength = maxLength - headLength - 1;
  return `${value.slice(0, headLength)}…${value.slice(-tailLength)}`;
};

const buildPlanningFeedback = (
  summaries: BrowserAgentPageSummary[],
  total: number,
  offset: number,
  activeIndex: number | undefined,
) => {
  if (total === 0) {
    return 'ListBrowserPages: no open pages.';
  }

  const nextOffset = offset + summaries.length;
  const continuation =
    nextOffset < total
      ? ` Next: ListBrowserPages({offset:${nextOffset}}).`
      : '';
  const header = `ListBrowserPages ${offset}-${nextOffset - 1} of ${total}; active ${activeIndex ?? 'none'} (0-based). Use SetActivePage.${continuation}\n`;
  if (summaries.length === 0) {
    return header.trimEnd();
  }
  const lines = summaries.map((summary) => {
    const prefix = `${summary.active ? '*' : ' '}${summary.index}|`;
    const title = truncateFeedbackValue(
      normalizeFeedbackValue(summary.title),
      maxListTitleLength,
    );
    const url = truncateFeedbackValue(
      normalizeFeedbackValue(summary.url),
      maxListUrlLength,
    );
    return `${prefix}${title}|${url}`;
  });

  return `${header}${lines.join('\n')}`;
};

const buildPageInfoPlanningFeedback = (summary: BrowserAgentPageSummary) =>
  `GetBrowserPageInfo index ${summary.index}; active ${summary.active}.\nTitle: ${summary.title}\nURL: ${summary.url}`;

const setActivePageParamSchema: z.ZodType<BrowserAgentPageSelector> = z.object({
  index: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe('0-based page/tab index returned by ListBrowserPages.'),
  title: z
    .string()
    .optional()
    .describe('Case-insensitive page title substring to match.'),
  url: z
    .string()
    .optional()
    .describe('Case-insensitive page URL substring to match.'),
});

const listBrowserPagesParamSchema = z
  .object({
    offset: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('0-based starting position. Omit for the first page.'),
  })
  .optional();

const getBrowserPageInfoParamSchema = z.object({
  index: z
    .number()
    .int()
    .min(0)
    .describe('0-based page/tab index returned by ListBrowserPages.'),
});

export const createBrowserAgentPageActions = <Page, NewPageEvent>(options: {
  getPageManager: () => BrowserPageManager<Page, NewPageEvent>;
}): DeviceAction<any>[] => [
  {
    name: 'ListBrowserPages',
    description:
      'List open browser pages/tabs in groups of 8 and show which one is active. Use offset to see the next group before switching pages.',
    paramSchema: listBrowserPagesParamSchema,
    planningFeedbackMaxLength: 'unlimited',
    call: async (param, context) => {
      const summaries = await options.getPageManager().pageSummaries();
      const offset = param?.offset ?? 0;
      if (summaries.length > 0 && offset >= summaries.length) {
        throw new Error(
          `[midscene] ListBrowserPages offset ${offset} is out of range for ${summaries.length} pages. Start again with offset 0.`,
        );
      }
      const visibleSummaries = summaries.slice(offset, offset + pageListSize);
      if (context?.task) {
        context.task.planningFeedback = buildPlanningFeedback(
          visibleSummaries,
          summaries.length,
          offset,
          summaries.find(({ active }) => active)?.index,
        );
      }
      return visibleSummaries;
    },
  },
  {
    name: 'GetBrowserPageInfo',
    description:
      'Get the complete title and URL for one browser page/tab without switching the active page. Use this when ListBrowserPages truncates details needed to identify a page.',
    paramSchema: getBrowserPageInfoParamSchema,
    planningFeedbackMaxLength: 'unlimited',
    sample: {
      index: 1,
    },
    call: async (param, context) => {
      const summary = await options
        .getPageManager()
        .pageSummaryByIndex(param.index);
      if (context?.task) {
        context.task.planningFeedback = buildPageInfoPlanningFeedback(summary);
      }
      return summary;
    },
  },
  {
    name: 'SetActivePage',
    description:
      'Set the active browser page/tab by 0-based index, title substring, or URL substring. When index is combined with title or URL, all provided values must match the same page. Use index from ListBrowserPages when more than one page could match.',
    paramSchema: setActivePageParamSchema,
    sample: {
      index: 1,
    },
    call: async (param) =>
      options.getPageManager().setActivePageBySelector(param),
  },
];

export const appendBrowserAgentPageActions = (
  customActions: DeviceAction<any>[] | undefined,
  browserActions: DeviceAction<any>[],
) => {
  if (!customActions?.length) {
    return browserActions;
  }

  const customActionNames = new Set(customActions.map((action) => action.name));
  return [
    ...customActions,
    ...browserActions.filter((action) => !customActionNames.has(action.name)),
  ];
};
