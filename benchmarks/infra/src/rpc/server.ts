import jayson from 'jayson';

import { NewAgentParams, RPCMethod, RPCResponse, IRPCService } from '../types';
import { AndroidRPCService } from './service/android';

export class MidsceneRPCServer {
  private server: jayson.Server;

  private service: IRPCService | undefined;

  constructor() {
    this.server = jayson.server({
      [RPCMethod.NewAgent]: this[RPCMethod.NewAgent].bind(this),
      [RPCMethod.RunAIMethod]: this[RPCMethod.RunAIMethod].bind(this),
    });
  }

  start(port: number) {
    this.server.http().listen(port, () => {
      console.log(`Midscene RPC server listening on port ${port}`);
    });
  }

  private [RPCMethod.RunAIMethod]: (
    params: { goal: string },
    callback: (err: any, res: RPCResponse<string>) => void,
  ) => void = async (params, callback) => {
    if (!this.service) {
      callback(null, { code: 0, data: { reason: 'Agent not setup' } });
      return;
    }

    const { goal } = params;

    try {
      const result = await this.service.ai(goal);
      callback(null, { code: 1, data: result });
    } catch (err) {
      callback(null, { code: 0, data: { reason: (err as Error).message } });
    }
  };

  private [RPCMethod.NewAgent]: (
    params: NewAgentParams,
    callback: (err: any, res: RPCResponse<string>) => void,
  ) => void = (params, callback) => {
    let setupPromise;

    const { type } = params;
    if (type === 'android') {
      // AndroidAgent
      this.service = new AndroidRPCService(params.deviceId);
      setupPromise = this.service.setup(params.options?.id);
    } else if (type === 'ios') {
      // IOSAgent
    }

    if (setupPromise) {
      setupPromise
        .then(() => {
          callback(null, { code: 1, data: `${type} agent setup success` });
        })
        .catch((err) => {
          callback(null, { code: 0, data: { reason: err.message } });
        });
    } else {
      callback(null, { code: 1, data: 'No agent setup required' });
    }
  };
}
