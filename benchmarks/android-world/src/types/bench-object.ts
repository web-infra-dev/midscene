export interface IBenchObject {
  step(options: { goal: string }): Promise<any>;
}
