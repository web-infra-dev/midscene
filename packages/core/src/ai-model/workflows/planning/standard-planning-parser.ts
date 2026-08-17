import type {
  DeviceAction,
  RawResponsePlanningAIResponse,
  SubGoal,
  SubGoalStatus,
} from '@/types';
import type { JsonParser } from '../../shared/json';
import { extractXMLTag } from '../../shared/xml';
import { buildPlanningActionLog } from './planning-action-log';

/**
 * Parse sub-goals from XML content.
 * Handles both formats:
 * - <sub-goal index="1" status="pending">description</sub-goal>
 * - <sub-goal index="1" status="finished" />
 */
export function parseSubGoalsFromXML(xmlContent: string): SubGoal[] {
  const subGoals: SubGoal[] = [];
  const regex =
    /<sub-goal\s+index="(\d+)"\s+status="(pending|finished)"(?:\s*\/>|>([\s\S]*?)<\/sub-goal>)/gi;

  let match = regex.exec(xmlContent);
  while (match !== null) {
    const index = Number.parseInt(match[1], 10);
    const status = match[2] as SubGoalStatus;
    const description = match[3]?.trim() || '';

    subGoals.push({ index, status, description });
    match = regex.exec(xmlContent);
  }

  return subGoals;
}

/**
 * Extract indexes of sub-goals marked as finished from
 * <mark-sub-goal-done> content.
 */
export function parseMarkFinishedIndexes(xmlContent: string): number[] {
  const indexes: number[] = [];
  const regex = /<sub-goal\s+index="(\d+)"\s+status="finished"\s*\/>/gi;

  let match = regex.exec(xmlContent);
  while (match !== null) {
    indexes.push(Number.parseInt(match[1], 10));
    match = regex.exec(xmlContent);
  }

  return indexes;
}

/** Parse an XML model response into a planning response. */
export function parseXMLPlanningResponse(
  xmlString: string,
  jsonParser: JsonParser,
  options: { includeThought: boolean },
): RawResponsePlanningAIResponse {
  // Use <planning> instead of <thought> to avoid colliding with Gemini thought
  // summaries, which may also be emitted as <thought> in OpenAI-compatible
  // response content.
  const thought = options.includeThought
    ? extractXMLTag(xmlString, 'planning')
    : undefined;
  const memory = extractXMLTag(xmlString, 'memory');
  const log = extractXMLTag(xmlString, 'log') || '';
  const error = extractXMLTag(xmlString, 'error');
  const actionType = extractXMLTag(xmlString, 'action-type');
  const actionParamStr = extractXMLTag(xmlString, 'action-param-json');

  const completeGoalRegex =
    /<complete\s+success="(true|false)">([\s\S]*?)<\/complete>/i;
  const completeGoalMatch = xmlString.match(completeGoalRegex);
  let finalizeMessage: string | undefined;
  let finalizeSuccess: boolean | undefined;

  if (completeGoalMatch) {
    finalizeSuccess = completeGoalMatch[1] === 'true';
    finalizeMessage = completeGoalMatch[2]?.trim() || undefined;
  }

  const updatePlanContent = extractXMLTag(xmlString, 'update-plan-content');
  const markSubGoalDone = extractXMLTag(xmlString, 'mark-sub-goal-done');
  const updateSubGoals = updatePlanContent
    ? parseSubGoalsFromXML(updatePlanContent)
    : undefined;
  const markFinishedIndexes = markSubGoalDone
    ? parseMarkFinishedIndexes(markSubGoalDone)
    : undefined;

  let action: any = null;
  if (actionType && actionType.toLowerCase() !== 'null') {
    // Strip any trailing XML tags that leaked into the action type.
    const type = actionType.split('<')[0].trim();
    let param: any = undefined;

    if (actionParamStr) {
      try {
        param = jsonParser(actionParamStr, {
          source: 'planning-action-param',
          preserveStringValueKeys:
            type.toLowerCase() === 'input' ? ['value'] : undefined,
        });
      } catch (error) {
        throw new Error(`Failed to parse action-param-json: ${error}`);
      }
    }

    action = {
      type,
      ...(param !== undefined ? { param } : {}),
    };
  }

  return {
    ...(thought ? { thought } : {}),
    ...(memory ? { memory } : {}),
    log,
    ...(error ? { error } : {}),
    action,
    ...(finalizeMessage !== undefined ? { finalizeMessage } : {}),
    ...(finalizeSuccess !== undefined ? { finalizeSuccess } : {}),
    ...(updateSubGoals?.length ? { updateSubGoals } : {}),
    ...(markFinishedIndexes?.length ? { markFinishedIndexes } : {}),
  };
}

type ParseStandardPlanningResponseOptions = {
  includeThought: boolean;
} & (
  | {
      logSource?: 'model';
    }
  | {
      logSource: 'action';
      actionSpace: DeviceAction<any>[];
    }
);

export function parseStandardPlanningResponse(
  xmlString: string,
  jsonParser: JsonParser,
  options: ParseStandardPlanningResponseOptions,
): RawResponsePlanningAIResponse {
  const response = parseXMLPlanningResponse(xmlString, jsonParser, {
    includeThought: options.includeThought,
  });

  if (options.logSource !== 'action') {
    return response;
  }

  return {
    ...response,
    log: response.action
      ? buildPlanningActionLog(response.action, options.actionSpace)
      : 'No action',
  };
}
