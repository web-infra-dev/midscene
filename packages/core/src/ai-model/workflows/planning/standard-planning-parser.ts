import type {
  DeviceAction,
  RawResponsePlanningAIResponse,
  SubGoal,
  SubGoalStatus,
} from '@/types';
import type { PlanningActionOutputProtocol } from '../../model-adapter/planning-protocol';
import { extractRawXMLFragment, extractXMLTag } from '../../shared/xml';
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

type XMLPlanningResponse = Omit<RawResponsePlanningAIResponse, 'action'>;

type XMLPlanningResponseParseResult = {
  parsed: XMLPlanningResponse;
  rawActionOutput: string;
};

/** Parse common XML fields and retain the raw action-protocol XML. */
export function parseXMLPlanningResponse(
  xmlString: string,
  actionOutputTagNames: PlanningActionOutputProtocol['actionOutputTagNames'],
  options: { includeThought: boolean },
): XMLPlanningResponseParseResult {
  // Use <planning> instead of <thought> to avoid colliding with Gemini thought
  // summaries, which may also be emitted as <thought> in OpenAI-compatible
  // response content.
  const thought = options.includeThought
    ? extractXMLTag(xmlString, 'planning')
    : undefined;
  const memory = extractXMLTag(xmlString, 'memory');
  const log = extractXMLTag(xmlString, 'log') || '';
  const error = extractXMLTag(xmlString, 'error');

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

  return {
    parsed: {
      ...(thought ? { thought } : {}),
      ...(memory ? { memory } : {}),
      log,
      ...(error ? { error } : {}),
      ...(finalizeMessage !== undefined ? { finalizeMessage } : {}),
      ...(finalizeSuccess !== undefined ? { finalizeSuccess } : {}),
      ...(updateSubGoals?.length ? { updateSubGoals } : {}),
      ...(markFinishedIndexes?.length ? { markFinishedIndexes } : {}),
    },
    rawActionOutput: extractRawXMLFragment(xmlString, actionOutputTagNames),
  };
}

type ParseStandardPlanningResponseOptions = {
  includeThought: boolean;
  actionOutputProtocol: PlanningActionOutputProtocol;
  actionSpace: DeviceAction<any>[];
  logSource?: 'model' | 'action';
};

function buildNonActionPlanningLog(
  response: RawResponsePlanningAIResponse,
): string {
  if (response.error) {
    return `Error - ${response.error}`;
  }

  if (response.finalizeSuccess !== undefined) {
    return [
      `Complete - success: ${response.finalizeSuccess}`,
      response.finalizeMessage
        ? `message: ${response.finalizeMessage}`
        : undefined,
    ]
      .filter(Boolean)
      .join(', ');
  }

  return 'No action';
}

export function parseStandardPlanningResponse(
  xmlString: string,
  options: ParseStandardPlanningResponseOptions,
): RawResponsePlanningAIResponse {
  const { parsed, rawActionOutput } = parseXMLPlanningResponse(
    xmlString,
    options.actionOutputProtocol.actionOutputTagNames,
    { includeThought: options.includeThought },
  );
  const response: RawResponsePlanningAIResponse = {
    ...parsed,
    action: options.actionOutputProtocol.parseActionOutput(
      rawActionOutput,
      options.actionSpace,
    ),
  };

  if (options.logSource !== 'action') {
    return response;
  }

  return {
    ...response,
    log: response.action
      ? buildPlanningActionLog(response.action, options.actionSpace)
      : buildNonActionPlanningLog(response),
  };
}
