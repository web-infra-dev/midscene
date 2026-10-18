import { DurableObject } from 'cloudflare:workers';
import { handleRelay } from './relay-handler.mjs';
export class Coordinator extends DurableObject {
  fetch(request) {
    return handleRelay(request, this.env, this.ctx.storage);
  }
}
export default {
  fetch(request, env) {
    return env.COORDINATOR.getByName('verify-alpha-v1').fetch(request);
  },
};
