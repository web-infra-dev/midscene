import type { StudioRecorderCodeType } from '@shared/electron-contract';
import type {
  StudioRecordedEvent,
  StudioRecorderGenerationProgress,
  StudioRecorderGenerationStepId,
  StudioRecorderGenerationStepStatus,
  StudioRecordingSession,
} from '../../recorder/types';

export const CODE_TYPE_STORAGE_KEY = 'studio.recorder.defaultCodeType.v2';
export const LANGUAGE_STORAGE_KEY = 'studio.recorder.yamlLanguage';

export const LANGUAGE_OPTIONS = [
  { value: 'auto', label: 'Auto' },
  { value: 'English', label: 'English' },
  { value: 'Chinese', label: 'Chinese' },
  { value: 'Japanese', label: 'Japanese' },
  { value: 'Korean', label: 'Korean' },
  { value: 'French', label: 'French' },
  { value: 'Spanish', label: 'Spanish' },
];

export type ReplayableCodeType = Extract<
  StudioRecorderCodeType,
  'markdown' | 'yaml'
>;

export type StudioRecorderTab = 'timeline' | 'code';

export type StudioRecorderGenerationStepState = Record<
  StudioRecorderGenerationStepId,
  {
    status: StudioRecorderGenerationStepStatus;
    details?: string;
  }
>;

export type StudioRecorderGenerationState = {
  sessionId: string | null;
  type: StudioRecorderCodeType;
  status: 'idle' | 'generating' | 'success' | 'error';
  content: string;
  error: string | null;
  steps: StudioRecorderGenerationStepState;
};

export function formatDate(timestamp: number) {
  return new Date(timestamp).toLocaleString();
}

export function platformLabel(platformId: string) {
  return platformId.charAt(0).toUpperCase() + platformId.slice(1);
}

export function readPersistedCodeType(): StudioRecorderCodeType {
  if (typeof window === 'undefined') {
    return 'markdown';
  }
  const storedType = window.localStorage.getItem(CODE_TYPE_STORAGE_KEY);
  return storedType === 'markdown' ||
    storedType === 'yaml' ||
    storedType === 'playwright'
    ? storedType
    : 'markdown';
}

export function readPersistedLanguage() {
  if (typeof window === 'undefined') {
    return 'auto';
  }
  return window.localStorage.getItem(LANGUAGE_STORAGE_KEY) || 'auto';
}

export function getSessionTargetText(session: StudioRecordingSession) {
  if (session.url) {
    return session.url;
  }
  const targetUrl = session.target.values.url;
  if (typeof targetUrl === 'string' && targetUrl) {
    return targetUrl;
  }
  return session.target.label || platformLabel(session.target.platformId);
}

export function getSessionTargetLabel(session: StudioRecordingSession) {
  return session.url || session.target.platformId === 'web' ? 'URL' : 'Target';
}

export function isPlaywrightAvailable(session: StudioRecordingSession | null) {
  return session?.target.platformId === 'web';
}

export function getAvailableCodeType(
  session: StudioRecordingSession | null,
  preferredType: StudioRecorderCodeType,
): StudioRecorderCodeType {
  if (preferredType === 'playwright' && !isPlaywrightAvailable(session)) {
    return 'markdown';
  }
  return preferredType;
}

export function codeTypeLabel(type: StudioRecorderCodeType) {
  switch (type) {
    case 'markdown':
      return 'Markdown';
    case 'playwright':
      return 'Playwright';
    default:
      return 'YAML';
  }
}

export function generatingText(type: StudioRecorderCodeType) {
  switch (type) {
    case 'markdown':
      return 'Generating markdown...';
    case 'playwright':
      return 'Generating Playwright...';
    default:
      return 'Generating YAML...';
  }
}

export function getMarkdownOutputLabel(
  content: string,
  session?: StudioRecordingSession | null,
) {
  const firstHeading = content
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.startsWith('# '));

  if (firstHeading) {
    return firstHeading.replace(/^#\s+/, '');
  }

  return session?.name || 'Markdown replay';
}

export function createInitialGenerationSteps(): StudioRecorderGenerationStepState {
  return {
    prepare: { status: 'pending' },
    metadata: { status: 'pending' },
    code: { status: 'pending' },
  };
}

export function mergeGenerationProgress(
  steps: StudioRecorderGenerationStepState,
  progress: StudioRecorderGenerationProgress,
): StudioRecorderGenerationStepState {
  return {
    ...steps,
    [progress.step]: {
      status: progress.status,
      details: progress.details,
    },
  };
}

function getGenerationStepState(status: StudioRecorderGenerationStepStatus) {
  if (status === 'completed') {
    return 'success';
  }
  if (status === 'loading') {
    return 'running';
  }
  if (status === 'error') {
    return 'error';
  }
  return 'idle';
}

export function getGenerationSteps(
  type: StudioRecorderCodeType,
  steps: StudioRecorderGenerationStepState,
) {
  const label = codeTypeLabel(type);
  return [
    {
      title: 'Prepare Recorded Events',
      description: 'Collecting timeline events and target metadata',
      details: steps.prepare.details,
      state: getGenerationStepState(steps.prepare.status),
    },
    {
      title: 'Generate Title & Description',
      description: 'Creating session title and description using AI',
      details: steps.metadata.details,
      state: getGenerationStepState(steps.metadata.status),
    },
    {
      title: `Generate ${label}`,
      description:
        type === 'playwright'
          ? 'Creating executable Playwright test code'
          : type === 'markdown'
            ? 'Creating Midscene Markdown replay script'
            : 'Creating YAML configuration',
      details: steps.code.details,
      state: getGenerationStepState(steps.code.status),
    },
  ] as const;
}
