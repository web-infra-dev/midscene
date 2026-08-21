#!/usr/bin/env node
import { syncCoreReportTemplateModules } from './report-template-utils.mjs';

const writtenFiles = syncCoreReportTemplateModules();

console.log(
  `[@midscene/core] Report template synchronized to ${writtenFiles.length} module(s).`,
);
