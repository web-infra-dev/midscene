import type { RawResponsePlanningAIResponse } from '@/types';
import type { TModelFamily } from '@midscene/shared/env';
import { getModelAdapter } from '../../models';
import {
  extractXMLTag,
  parseMarkFinishedIndexes,
  parseSubGoalsFromXML,
} from '../../prompts/util';

/**
 * Parse XML response from LLM and convert to RawResponsePlanningAIResponse.
 */
export function parseXMLPlanningResponse(
  xmlString: string,
  modelFamily: TModelFamily | undefined,
): RawResponsePlanningAIResponse {
  const thought = extractXMLTag(xmlString, 'thought');
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
    const type = actionType.split('<')[0].trim();
    let param: any = undefined;

    if (actionParamStr) {
      try {
        param = getModelAdapter(modelFamily).jsonParser(actionParamStr);
      } catch (e) {
        throw new Error(`Failed to parse action-param-json: ${e}`);
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
