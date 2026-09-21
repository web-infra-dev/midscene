import {
  MIDSCENE_REPORT_TAG_NAME,
  globalConfigManager,
} from '@midscene/shared/env';
import { uuid } from '@midscene/shared/utils';
import dayjs from 'dayjs';

export function getReportFileName(tag = 'web') {
  const reportTagName = globalConfigManager.getEnvConfigValue(
    MIDSCENE_REPORT_TAG_NAME,
  );
  const dateTimeInFileName = dayjs().format('YYYY-MM-DD_HH-mm-ss');
  const uniqueId = uuid().substring(0, 8);
  return `${reportTagName || tag}-${dateTimeInFileName}-${uniqueId}`;
}
