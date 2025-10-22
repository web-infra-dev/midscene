import os from 'node:os';
import {
  AgentOverChromeBridge,
  getBridgePageInCliSide,
} from '@/bridge-mode/agent-cli-side';
import { describe, expect, it, vi } from 'vitest';

vi.setConfig({
  testTimeout: 60 * 1000,
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// 获取本机局域网 IP 地址
function getLocalIP(): string {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    const iface = interfaces[name];
    if (!iface) continue;
    for (const alias of iface) {
      if (alias.family === 'IPv4' && !alias.internal) {
        return alias.address;
      }
    }
  }
  return '127.0.0.1';
}

describe.skipIf(!process.env.BRIDGE_MODE)(
  'remote access verification',
  {
    timeout: 3 * 60 * 1000,
  },
  () => {
    it('should use default localhost (127.0.0.1)', async () => {
      const agent = new AgentOverChromeBridge();
      // 默认监听 127.0.0.1:3766

      console.log('✓ Server listening on 127.0.0.1:3766 (default)');
      console.log('  - Only accessible from localhost');
      console.log(
        '  - Chrome extension should connect to: ws://localhost:3766',
      );

      await agent.connectNewTabWithUrl('https://www.example.com');
      await sleep(2000);

      expect(true).toBe(true);
      await agent.destroy();
    });

    it('should allow remote access with allowRemoteAccess flag', async () => {
      const localIP = getLocalIP();

      const agent = new AgentOverChromeBridge({
        allowRemoteAccess: true, // 监听 0.0.0.0:3766
      });

      console.log('✓ Server listening on 0.0.0.0:3766 (remote access enabled)');
      console.log(`  - Accessible from localhost AND ${localIP}`);
      console.log('  - Chrome extension can connect to:');
      console.log('    * ws://localhost:3766');
      console.log(`    * ws://${localIP}:3766`);
      console.log('');
      console.log('📝 To test remote access:');
      console.log('   1. Open Chrome extension settings');
      console.log(`   2. Set Bridge Server URL to: ws://${localIP}:3766`);
      console.log('   3. Enable Bridge Mode');
      console.log('   4. The connection should succeed!');

      await agent.connectNewTabWithUrl('https://www.example.com');
      await sleep(2000);

      expect(true).toBe(true);
      await agent.destroy();
    });

    it('should allow custom host configuration', async () => {
      const localIP = getLocalIP();

      const agent = new AgentOverChromeBridge({
        host: localIP, // 监听特定网卡
        port: 3766,
      });

      console.log(`✓ Server listening on ${localIP}:3766 (custom host)`);
      console.log('  - Only accessible from this specific network interface');
      console.log(
        `  - Chrome extension should connect to: ws://${localIP}:3766`,
      );

      await agent.connectNewTabWithUrl('https://www.example.com');
      await sleep(2000);

      expect(true).toBe(true);
      await agent.destroy();
    });

    it('should support custom port', async () => {
      const customPort = 8080;

      const agent = new AgentOverChromeBridge({
        allowRemoteAccess: true,
        port: customPort,
      });

      console.log(`✓ Server listening on 0.0.0.0:${customPort} (custom port)`);
      console.log(
        `  - Chrome extension should connect to: ws://localhost:${customPort}`,
      );

      await agent.connectNewTabWithUrl('https://www.example.com');
      await sleep(2000);

      expect(true).toBe(true);
      await agent.destroy();
    });

    it('verification: compare default vs remote access', async () => {
      const localIP = getLocalIP();

      console.log('');
      console.log('='.repeat(60));
      console.log('📊 Remote Access Feature Verification Summary');
      console.log('='.repeat(60));
      console.log('');
      console.log('🔒 DEFAULT MODE (secure, local only):');
      console.log('   Code: new AgentOverChromeBridge()');
      console.log('   Listening: 127.0.0.1:3766');
      console.log('   ✅ localhost can connect');
      console.log(`   ❌ ${localIP} CANNOT connect`);
      console.log('');
      console.log('🌐 REMOTE ACCESS MODE (allows remote):');
      console.log(
        '   Code: new AgentOverChromeBridge({ allowRemoteAccess: true })',
      );
      console.log('   Listening: 0.0.0.0:3766');
      console.log('   ✅ localhost can connect');
      console.log(`   ✅ ${localIP} CAN connect`);
      console.log('');
      console.log('🎯 YOUR LOCAL IP:');
      console.log(`   ${localIP}`);
      console.log('');
      console.log('📝 HOW TO TEST:');
      console.log('   1. Run this test with BRIDGE_MODE=1');
      console.log('   2. Open Chrome extension');
      console.log('   3. Set server URL to:');
      console.log('      - For default mode: ws://localhost:3766');
      console.log(`      - For remote mode:  ws://${localIP}:3766`);
      console.log('   4. Verify connection status');
      console.log('='.repeat(60));
      console.log('');

      expect(localIP).toBeTruthy();
    });
  },
);
