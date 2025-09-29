
import { getMidsceneRunSubDir } from '@midscene/shared/common'
import * as fs from 'fs';
import * as path from 'path';

function createCacheFile(cachePath: string, filename: string, content = ''): string {
    // Ensure that the directory exists (created recursively)
    if (!fs.existsSync(cachePath)) {
        fs.mkdirSync(cachePath, { recursive: true });
    }

    // join complete file path
    const filePath = path.join(cachePath, filename);

    // write the content of the file
    fs.writeFileSync(filePath, content);

    return filePath;
}

function newReportCache(): string {
    const cachePath = getMidsceneRunSubDir('cache');
    return createCacheFile(cachePath, 'cache_data');
}
console.log("cache file created:", newReportCache());
