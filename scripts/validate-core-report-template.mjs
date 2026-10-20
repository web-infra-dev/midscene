#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateCoreReportTemplateModules } from './report-template-utils.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const coreDistDir = path.resolve(__dirname, '../packages/core/dist');

validateCoreReportTemplateModules(coreDistDir);
console.log('[@midscene/core] Report template modules are valid.');
