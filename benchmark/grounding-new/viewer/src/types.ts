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
