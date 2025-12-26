export interface IRPCService {
  setup(fileName?: string): Promise<void>;
  ai(goal: string): Promise<string>;
  terminate(status: 'Successful' | 'Failed' | undefined): Promise<void>;
}
