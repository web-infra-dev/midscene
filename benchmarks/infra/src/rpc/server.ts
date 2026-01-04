import jayson from 'jayson';

import {
  NewAgentParams,
  RPCMethod,
  RPCResponse,
  IRPCService,
  TerminateAgentParams,
  RunAIMethodParams,
} from '../types';
import { AndroidRPCService } from './service/android';

export class MidsceneRPCServer {
  private server: jayson.Server;
  private service: IRPCService | undefined;
  private serviceRecord: Record<string, IRPCService> = {};

  constructor() {
    const rpcMethods = {
      [RPCMethod.NewAgent]: this[RPCMethod.NewAgent].bind(this),
      [RPCMethod.RunAIMethod]: this[RPCMethod.RunAIMethod].bind(this),
      [RPCMethod.TerminateAgent]: this[RPCMethod.TerminateAgent].bind(this),
    };

    this.server = jayson.server(rpcMethods);
  }

  start(port: number) {
    this.server.http().listen(port, () => {
      console.log(`[Midscene RPC] Server is running: http://localhost:${port}`);
    });
  }

  private [RPCMethod.RunAIMethod]: (
    params: RunAIMethodParams,
    callback: (err: any, res: RPCResponse<string>) => void,
  ) => void = async (params, callback) => {
    if (!this.service) {
      callback(null, { code: 0, data: { reason: 'Agent not setup' } });
      return;
    }

    const { task } = params;

    try {
      const result = await this.service.ai(task);
      callback(null, { code: 1, data: result });
    } catch (err) {
      callback(null, { code: 0, data: { reason: (err as Error).message } });
    }
  };

  private [RPCMethod.NewAgent]: (
    params: NewAgentParams,
    callback: (err: any, res: RPCResponse<string>) => void,
  ) => void = (params, callback) => {
    console.log('[Midscene RPC] NewAgent called with params:', params);

    let setupPromise;

    const { type } = params;
    if (type === 'Android') {
      // AndroidAgent
      this.service = new AndroidRPCService(params.device);
      setupPromise = this.service.setup(params.id);
    } else if (type === 'iOS') {
      // IOSAgent
    }

    if (setupPromise) {
      setupPromise
        .then(() => {
          this.serviceRecord[params.id] = this.service!;
          callback(null, { code: 1, data: `${type} agent setup success` });
        })
        .catch((err) => {
          callback(null, { code: 0, data: { reason: err.message } });
        });
    } else {
      callback(null, { code: 1, data: 'No agent setup required' });
    }
  };

  private [RPCMethod.TerminateAgent]: (
    params: TerminateAgentParams,
    callback: (err: any, res: RPCResponse<string>) => void,
  ) => void = (params, callback) => {
    const { id, userTaskStatus } = params;
    const service = this.serviceRecord[id];
    if (!service) {
      callback(null, { code: 0, data: { reason: 'Agent not found' } });
      return;
    }
    service
      .terminate(userTaskStatus)
      .then(() => {
        delete this.serviceRecord[id];
        callback(null, { code: 1, data: 'Agent terminated successfully' });
      })
      .catch((err) => {
        callback(null, { code: 0, data: { reason: err.message } });
      });
  };
}
