import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type {
  CaseRecord,
  StoredModelGroupRecord,
  StoredModelRecord,
} from '../types.js';
import { casesDir, datasetDir, modelsFilePath } from './paths.js';

type NormalizableStoredModelRecord = Omit<
  Partial<StoredModelRecord>,
  'family'
> & {
  family?: StoredModelRecord['family'];
};

function normalizeNonEmptyString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeStoredModelRecord(
  raw: NormalizableStoredModelRecord,
): StoredModelRecord | null {
  if (
    !raw ||
    typeof raw.id !== 'string' ||
    typeof raw.baseUrl !== 'string' ||
    typeof raw.apiKey !== 'string' ||
    typeof raw.name !== 'string' ||
    typeof raw.providerId !== 'string'
  ) {
    return null;
  }

  const family = normalizeNonEmptyString(raw.family);
  const providerId = normalizeNonEmptyString(raw.providerId);
  if (!family || !providerId) {
    return null;
  }

  return {
    id: raw.id,
    baseUrl: raw.baseUrl,
    apiKey: raw.apiKey,
    name: raw.name,
    alias:
      typeof raw.alias === 'string' && raw.alias.trim() ? raw.alias : raw.name,
    shortName:
      typeof raw.shortName === 'string' && raw.shortName.trim()
        ? raw.shortName.trim()
        : '',
    logo:
      typeof raw.logo === 'string' && raw.logo.trim() ? raw.logo.trim() : '',
    family,
    apiType: raw.apiType === 'responses' ? 'responses' : undefined,
    providerId,
    note: typeof raw.note === 'string' ? raw.note : '',
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : '',
  };
}

function isGroupModelConfig(value: unknown): value is StoredModelGroupRecord {
  return Boolean(
    value &&
      typeof value === 'object' &&
      typeof (value as { groupName?: unknown }).groupName === 'string' &&
      Array.isArray((value as { models?: unknown }).models),
  );
}

function flattenModelGroup(group: StoredModelGroupRecord): StoredModelRecord[] {
  return group.models
    .map((model) => {
      if (typeof model.displayName !== 'string' || !model.displayName.trim()) {
        return null;
      }

      return normalizeStoredModelRecord({
        id: model.id,
        baseUrl: model.baseUrl ?? group.baseUrl,
        apiKey: model.apiKey ?? group.apiKey,
        name: model.name,
        alias: model.displayName,
        shortName: model.shortName,
        logo: model.logo ?? group.logo,
        family: model.family ?? group.family,
        apiType: model.apiType ?? group.apiType,
        providerId: model.providerId,
        note: model.note ?? group.note,
        createdAt: model.createdAt,
      });
    })
    .filter((item): item is StoredModelRecord => item !== null);
}

export function normalizeStoredModelsConfig(raw: unknown): StoredModelRecord[] {
  if (!Array.isArray(raw) || !raw.length)
    throw new Error('Expected a non-empty array of model groups');
  return raw.flatMap((group, index) => {
    if (!isGroupModelConfig(group) || !group.models.length)
      throw new Error(`Invalid model group ${index}`);
    const models = flattenModelGroup(group);
    if (
      models.length !== group.models.length ||
      models.some(
        (model) =>
          !model.name.trim() || !model.apiKey.trim() || !model.baseUrl.trim(),
      )
    )
      throw new Error(`Invalid model configuration in group ${index}`);
    return models;
  });
}

export async function loadModels(): Promise<StoredModelRecord[]> {
  if (!process.env.GROUNDING_MODELS_FILE && process.env.MIDSCENE_MODEL_NAME) {
    const env = process.env;
    if (
      !env.MIDSCENE_MODEL_BASE_URL ||
      !env.MIDSCENE_MODEL_API_KEY ||
      !env.MIDSCENE_MODEL_FAMILY
    ) {
      throw new Error(
        'Set MIDSCENE_MODEL_NAME, MIDSCENE_MODEL_BASE_URL, MIDSCENE_MODEL_API_KEY and MIDSCENE_MODEL_FAMILY',
      );
    }
    const model = normalizeStoredModelRecord({
      id: 'env-model',
      name: env.MIDSCENE_MODEL_NAME,
      alias: env.MIDSCENE_MODEL_NAME,
      baseUrl: env.MIDSCENE_MODEL_BASE_URL,
      apiKey: env.MIDSCENE_MODEL_API_KEY,
      family: env.MIDSCENE_MODEL_FAMILY,
      providerId:
        env.GROUNDING_PROVIDER_ID || new URL(env.MIDSCENE_MODEL_BASE_URL).host,
      apiType:
        env.MIDSCENE_MODEL_API_TYPE === 'responses' ? 'responses' : undefined,
    });
    if (!model) throw new Error('Invalid model environment configuration');
    return [model];
  }
  const parsed: unknown = JSON.parse(await readFile(modelsFilePath, 'utf8'));
  const models = normalizeStoredModelsConfig(parsed);
  if (!models.length)
    throw new Error('No valid models in GROUNDING_MODELS_FILE');
  if (new Set(models.map((model) => model.id)).size !== models.length)
    throw new Error('Duplicate model IDs');
  return models;
}

export type DatasetRow = {
  case_name: string;
  platform: 'web' | 'mobile';
  task_class: 'basic' | 'functional' | 'reason' | 'refusal';
  query: string;
  bbox_xyxy: [number, number, number, number] | null;
  image_sha256: string;
  width: number;
  height: number;
  source_name: string;
  source_category: string;
  source_id: string;
  image_path: string;
};

export async function loadManifest(): Promise<DatasetRow[]> {
  return (await readFile(path.join(datasetDir, 'manifest.jsonl'), 'utf8'))
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as DatasetRow);
}

export async function loadCases(): Promise<CaseRecord[]> {
  const manifest = await loadManifest();
  const names: string[] = JSON.parse(
    await readFile(path.join(datasetDir, 'case_names.json'), 'utf8'),
  );
  const rows = new Map(manifest.map((row) => [row.case_name, row]));
  if (rows.size !== manifest.length || names.length !== new Set(names).size)
    throw new Error('Duplicate dataset case IDs');
  return Promise.all(
    names.map(async (caseName) => {
      const row = rows.get(caseName);
      if (!row || !/^[a-zA-Z0-9._-]+$/.test(caseName))
        throw new Error(`Invalid manifest entry ${caseName}`);
      const parsed = JSON.parse(
        await readFile(path.join(casesDir, caseName, 'index.json'), 'utf8'),
      ) as CaseRecord;
      if (
        !parsed.prompt ||
        !Array.isArray(parsed.images) ||
        parsed.images.length !== 1
      )
        throw new Error(`Malformed case ${caseName}`);
      for (const image of parsed.images) {
        if (
          !image.fileName ||
          path.basename(image.fileName) !== image.fileName ||
          !['hd', 'sd'].includes(image.imageType)
        )
          throw new Error(`Invalid case image ${caseName}`);
        const refusal = image.expectedOutcome === 'refusal';
        if (
          refusal
            ? image.gtBox !== null
            : !(
                Array.isArray(image.gtBox) &&
                image.gtBox.length === 4 &&
                image.gtBox.every(Number.isFinite)
              )
        )
          throw new Error(`Invalid GT ${caseName}`);
        if (
          refusal !== (row.task_class === 'refusal') ||
          JSON.stringify(image.gtBox) !== JSON.stringify(row.bbox_xyxy) ||
          parsed.prompt !== row.query
        )
          throw new Error(`Manifest/index mismatch ${caseName}`);
      }
      return {
        ...parsed,
        caseName,
        fallbackPrompt: parsed.fallbackPrompt || '',
        note: parsed.note || '',
        tags: parsed.tags || [],
        platform: row.platform,
        taskClass: row.task_class,
        sourceName: row.source_name,
        sourceCategory: row.source_category,
      };
    }),
  );
}
