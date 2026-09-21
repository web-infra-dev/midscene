import { dataExtractionAPIs, validationAPIs } from '@midscene/playground';

const outputAndReportAPIs = [...dataExtractionAPIs, ...validationAPIs, 'aiAct'];

export function shouldShowOutputAlongsideReport(actionType?: string): boolean {
  return actionType !== undefined && outputAndReportAPIs.includes(actionType);
}
