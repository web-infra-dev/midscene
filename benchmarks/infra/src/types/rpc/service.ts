export interface IRPCService {
  setup(fileName?: string): Promise<void>;
  ai(goal: string): Promise<string>;
}
