import assert from 'node:assert';
import type { AIElementParseResponse, PlanningAIResponse } from '@/types';
import { multiDescription } from '../prompt/element_inspector';
import { callCozeAi } from './base';

const INSPECT_ELEMENT_BOT_ID = '7390985487806775304';
const AI_ACTION_BOT_ID = '7400540491193958417';

export async function CozeAiInspectElement(msg: {
  findElementDescription: string;
  screenshotBase64: string;
  pageDescription: string;
  multi?: boolean;
}) {
  const {
    multi = false,
    findElementDescription,
    screenshotBase64,
    pageDescription,
  } = msg;
  const query = JSON.stringify({
    description: findElementDescription,
    multi: multiDescription(multi),
    elementDescription: pageDescription,
  });

  const parseResult = await callCozeAi<AIElementParseResponse>({
    query,
    imgs: [screenshotBase64],
    botId: INSPECT_ELEMENT_BOT_ID,
  });
  return parseResult;
}

export async function CozeAiActionPlan(msg: {
  actionDescription: string;
  screenshotBase64: string;
  pageDescription: string;
}) {
  const { actionDescription, screenshotBase64, pageDescription } = msg;

  const parseResult = await callCozeAi<PlanningAIResponse>({
    query: JSON.stringify({
      actionDescription: actionDescription,
      elementDescription: pageDescription,
    }),
    imgs: [screenshotBase64],
    botId: AI_ACTION_BOT_ID,
  });
  return parseResult;
}

export async function CozeAiAssert(msg: {
  assertion: string;
  screenshotBase64: string;
  pageDescription: string;
}) {
  const { assertion, screenshotBase64, pageDescription } = msg;

  const parseResult = await callCozeAi<PlanningAIResponse>({
    query: JSON.stringify({
      assertion: assertion,
      elementDescription: pageDescription,
    }),
    imgs: [screenshotBase64],
    botId: AI_ACTION_BOT_ID,
  });
  return parseResult;
}
