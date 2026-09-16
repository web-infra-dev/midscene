import { type DeviceAction, z } from '@midscene/core';
import type {
  BrowserAgentPageSelector,
  BrowserAgentPageSummary,
  BrowserPageManager,
} from './browser-agent';

const maxPlanningFeedbackLength = 500;
const maxTitleLength = 48;

const normalizeFeedbackValue = (value: string) =>
  value.replace(/\s+/g, ' ').trim();

const truncateFeedbackValue = (value: string, maxLength: number) => {
  if (maxLength <= 0) {
    return '';
  }
  if (value.length <= maxLength) {
    return value;
  }
  return maxLength === 1 ? '…' : `${value.slice(0, maxLength - 1)}…`;
};

const buildPlanningFeedback = (summaries: BrowserAgentPageSummary[]) => {
  if (summaries.length === 0) {
    return 'ListBrowserPages: no open pages.';
  }

  const activeIndex = summaries.find(({ active }) => active)?.index ?? 'none';
  const header = `ListBrowserPages indexes 0-${summaries.length - 1}; active ${activeIndex} (0-based). Use SetActivePage:\n`;
  const prefixes = summaries.map(
    ({ index, active }) => `${active ? '*' : ' '}${index}|`,
  );
  const lineBudget = Math.floor(
    (maxPlanningFeedbackLength - header.length - summaries.length + 1) /
      summaries.length,
  );

  const minimumLineLength =
    Math.max(...prefixes.map(({ length }) => length)) + 1;
  if (lineBudget < minimumLineLength) {
    return header.trimEnd();
  }

  const lines = summaries.map((summary, index) => {
    const fieldBudget = lineBudget - prefixes[index].length - 1;
    const normalizedTitle = normalizeFeedbackValue(summary.title);
    const title = truncateFeedbackValue(
      normalizedTitle,
      Math.min(maxTitleLength, Math.floor(fieldBudget / 3)),
    );
    const url = truncateFeedbackValue(
      normalizeFeedbackValue(summary.url),
      fieldBudget - title.length,
    );
    return `${prefixes[index]}${title}|${url}`;
  });

  return `${header}${lines.join('\n')}`;
};

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

export class BrowserPageManagerSlot<Page, NewPageEvent> {
  private currentManager?: BrowserPageManager<Page, NewPageEvent>;

  constructor(private readonly agentName: string) {}

  requireCurrent() {
    if (!this.currentManager) {
      throw new Error(
        `[midscene] ${this.agentName} page manager is not initialized.`,
      );
    }
    return this.currentManager;
  }

  initialize(pageManager: BrowserPageManager<Page, NewPageEvent>) {
    if (this.currentManager) {
      throw new Error(
        `[midscene] ${this.agentName} page manager is already initialized.`,
      );
    }
    this.currentManager = pageManager;
  }

  replace(pageManager: BrowserPageManager<Page, NewPageEvent>) {
    this.requireCurrent().destroy();
    this.currentManager = pageManager;
  }
}

export const createBrowserAgentPageActions = <Page, NewPageEvent>(options: {
  agentName: string;
  getPageManager: () => BrowserPageManager<Page, NewPageEvent>;
}): DeviceAction<any>[] => [
  {
    name: 'ListBrowserPages',
    description:
      'List all open browser pages/tabs and show which one is currently active. Use this before switching pages when a task refers to another tab or window.',
    call: async (_param, context) => {
      const summaries = await options.getPageManager().pageSummaries();
      if (context?.task) {
        context.task.planningFeedback = buildPlanningFeedback(summaries);
      }
      return summaries;
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
