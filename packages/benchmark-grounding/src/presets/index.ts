import type { ReportMeta } from '../schemas';
import { logos } from './logos';
import metadata from './metadata.json';

const publicMetadata = metadata as unknown as ReportMeta;

/** Public reference data only; model connection settings are never included. */
export const presetMeta: ReportMeta = {
  models: publicMetadata.models,
  families: Object.fromEntries(
    Object.entries(metadata.families).map(([name, family]) => [
      name,
      {
        color: family.color,
        ...(logos[name.toLowerCase()]
          ? { logo: logos[name.toLowerCase()] }
          : {}),
      },
    ]),
  ),
};
