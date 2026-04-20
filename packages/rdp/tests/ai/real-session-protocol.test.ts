import { RDPAgent } from '@/agent';
import { RDPDevice } from '@/device';
import { describe, expect, it } from 'vitest';

const realRdpEnv = {
  enabled: process.env.MIDSCENE_RDP_REAL_TEST === '1',
  host: process.env.MIDSCENE_RDP_REAL_HOST,
  port: Number(process.env.MIDSCENE_RDP_REAL_PORT || '3389'),
  username: process.env.MIDSCENE_RDP_REAL_USERNAME,
  password: process.env.MIDSCENE_RDP_REAL_PASSWORD,
  ignoreCertificate: process.env.MIDSCENE_RDP_REAL_IGNORE_CERTIFICATE !== '0',
};

const shouldRunRealRdpTest = Boolean(
  realRdpEnv.enabled &&
    realRdpEnv.host &&
    realRdpEnv.username &&
    realRdpEnv.password,
);
const SESSION_CONFLICT_PATTERN =
  /ERRINFO_RPC_INITIATED_DISCONNECT|administrative tool on the server in another session/u;
const MAX_REAL_RDP_ATTEMPTS = 3;

function createRealRdpDevice() {
  return new RDPDevice({
    host: realRdpEnv.host!,
    port: realRdpEnv.port,
    username: realRdpEnv.username!,
    password: realRdpEnv.password!,
    adminSession: false,
    ignoreCertificate: realRdpEnv.ignoreCertificate,
  });
}

function isSessionConflict(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return SESSION_CONFLICT_PATTERN.test(message);
}

async function delay(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

describe.skipIf(!shouldRunRealRdpTest)(
  '@midscene/rdp real protocol session',
  {
    timeout: 8 * 60 * 1000,
  },
  () => {
    it('opens the remote Windows Start menu through the protocol backend', async () => {
      let lastError: unknown;

      for (let attempt = 1; attempt <= MAX_REAL_RDP_ATTEMPTS; attempt++) {
        let device: RDPDevice | undefined;
        try {
          device = createRealRdpDevice();
          await device.connect();

          const agent = new RDPAgent(device, {
            aiActionContext:
              'You are controlling a remote Windows desktop directly through the RDP protocol. Every screenshot and action comes from the remote machine itself, not from the local macOS desktop.',
            generateReport: true,
            autoPrintReportMsg: false,
            reportFileName: 'rdp-real-session-protocol-ai-report',
          });

          const result = await agent.aiAct(
            'Open the Windows Start menu on the remote desktop. Stop only after the Start menu is clearly visible in the remote screenshot.',
          );

          expect(result).toBeTruthy();
          return;
        } catch (error) {
          lastError = error;

          if (!isSessionConflict(error) || attempt === MAX_REAL_RDP_ATTEMPTS) {
            throw error;
          }

          await delay(attempt * 2_000);
        } finally {
          await device?.destroy().catch(() => {});
        }
      }

      throw lastError;
    });
  },
);
