export const categoryItems = [
  'Basic Element',
  'Specialized Icon',
  'Small Target',
  'Color Recognition',
  'Functional',
  'Reasoning',
  'Fine-grained Manipulation',
  'Relative Position',
  'Disambiguation',
  'Refusal',
] as const;

export type CategoryItem = (typeof categoryItems)[number];
export type GroundTruth = [number, number, number, number] | 'REFUSAL';

export interface EvaluationResult {
  id: string;
  testcase: string;
  platform: 'web' | 'mobile';
  model: string;
  instructionLanguage: 'en' | 'zh';
  instruction: string;
  groundTruth: GroundTruth;
  prediction:
    | {
        outcome: 'POINT';
        center?: [number, number];
        rect?: { left: number; top: number; width: number; height: number };
        dpr?: number;
      }
    | { outcome: 'REFUSAL' | 'ERROR' };
  correct: boolean;
  durationMs: number;
  error?: string;
  jsonUrl: string;
}

export interface Testcase {
  name: string;
  platform: 'web' | 'mobile';
  category: { item: CategoryItem; reason: string };
  instruction: { en: string; zh: string };
  instructionLanguage: 'en' | 'zh';
  groundTruth: GroundTruth;
  reference: {
    url: string;
    dataset: string;
    recordId: string;
    image: { format: 'png' | 'jpeg'; sha256: string };
    patch: string | null;
    collectedAt: number;
  };
}

export interface TestcaseView extends Testcase {
  imageUrl: string;
}

export interface Filters {
  search: string;
  platform: string;
  category: string;
  dataset: string;
  outcome: string;
}
