import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { type ReportMeta, reportMetaSchema } from '../schemas';
import { presetMeta } from './index';

const imageDataUri =
  /^data:image\/(?:png|jpeg|gif|webp|svg\+xml|avif|x-icon)(?:;base64,[A-Za-z0-9+/]+={0,2}|(?:;charset=[\w-]+|;utf8)?,[^\r\n]+)$/i;

/** Capture user data before awaiting; same-name entries replace whole entries. */
export async function mergeReportMeta(meta?: ReportMeta): Promise<ReportMeta> {
  const custom = reportMetaSchema.parse(meta ?? {});
  const merged = reportMetaSchema.parse({
    models: { ...presetMeta.models, ...custom.models },
    families: { ...presetMeta.families, ...custom.families },
  });
  const workingDirectory = process.cwd();
  await Promise.all(
    Object.entries(merged.families ?? {}).map(async ([name, family]) => {
      if (!family.logo || imageDataUri.test(family.logo)) return;
      if (
        !path.isAbsolute(family.logo) &&
        /^[a-z][a-z\d+.-]*:/i.test(family.logo)
      ) {
        throw new Error(
          `Metadata family ${name}: logo must be a local file or image data URI`,
        );
      }
      const filename = path.resolve(workingDirectory, family.logo);
      const mime = {
        '.svg': 'image/svg+xml',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.webp': 'image/webp',
        '.gif': 'image/gif',
        '.avif': 'image/avif',
        '.ico': 'image/x-icon',
      }[path.extname(filename).toLowerCase()];
      if (!mime)
        throw new Error(
          `Metadata family ${name}: unsupported logo image extension`,
        );
      const bytes = await readFile(filename);
      if (!bytes.length)
        throw new Error(`Metadata family ${name}: logo image is empty`);
      family.logo = `data:${mime};base64,${bytes.toString('base64')}`;
    }),
  );
  return merged;
}
