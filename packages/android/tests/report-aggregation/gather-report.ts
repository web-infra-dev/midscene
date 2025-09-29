import * as fs from 'fs';
import * as path from 'path';
import { getMidsceneRunSubDir } from '@midscene/shared/common'

const cacheDir = getMidsceneRunSubDir('cache');
const cachePath = path.join(cacheDir, 'cache_data');

function getReportTpl() {
    const __DEV_REPORT_PATH__ = path.resolve(__dirname, '../../../../apps/report/dist/index.html');
    if (typeof __DEV_REPORT_PATH__ === 'string' && __DEV_REPORT_PATH__) {
        return fs.readFileSync(__DEV_REPORT_PATH__, 'utf-8');
    }
    const reportTpl = 'REPLACE_ME_WITH_REPORT_HTML';

    return reportTpl;
}
/**
 * reach cache data
 */
function readReportCache(): string {
    try {
        return fs.readFileSync(cachePath, 'utf-8');
    } catch (err) {
        console.error('reading cache file failed:', err);
        return ''; // Return an empty string as default
    }
}
/**
 * generate the final report and clear the cache
 */
function gatherReport(): void {
    // 1. prepare path
    const reportDir = getMidsceneRunSubDir('report');
    // get current time and format into YYYY-MM-DD_HH-MM-SS
    const now = new Date();
    const dateStr = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}_` +
        `${now.getHours().toString().padStart(2, '0')}-${now.getMinutes().toString().padStart(2, '0')}-${now.getSeconds().toString().padStart(2, '0')}`;
    // join dateStr into file name
    const outFilePath = path.join(reportDir, `aggregated_report_${dateStr}.html`);

    // 2. reach cache data
    const cacheData = readReportCache();

    // 3. generate report content
    const reportContent = getReportTpl() + cacheData;

    // 4. write report file
    fs.mkdirSync(reportDir, { recursive: true });
    fs.writeFileSync(outFilePath, reportContent, 'utf-8');

    // 5. clean up cache
    try {
        fs.unlinkSync(cachePath);
        console.log('cache file cleaned, report location:', outFilePath);
    } catch (err) {
        console.error('fail to clean cache file:', err);
    }
}

gatherReport();
