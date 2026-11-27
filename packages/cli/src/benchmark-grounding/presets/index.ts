import type { ReportMetaInput } from '../core/schemas';
import metadata from './metadata.json';

/** Public reference data only; model connection settings are never included. */
export const presetMeta = metadata as unknown as ReportMetaInput;
