export type BenchCaseMeta = {
  name: string;
  template: string;
  difficulty: string;
  tags: string[];
  optimalSteps: number;
};

export interface IBenchCase {
  result?: Record<string, any>;
  isSuccessful(): boolean;
  updateResult(res: Record<string, any>): void;
}
