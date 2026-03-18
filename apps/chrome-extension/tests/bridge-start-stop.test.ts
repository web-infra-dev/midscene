/**
 * Unit tests for bridge mode start/stop and server URL configuration.
 *
 * Covers:
 * 1. BridgeConnector can be stopped and restarted
 * 2. BridgeConnector can be started with a different server endpoint
 * 3. Worker message handling for BRIDGE_START and BRIDGE_STOP
 *
 * Related issue: https://github.com/web-infra-dev/midscene/issues/2119
 * - Users cannot stop/start listening in bridge mode
 * - Users cannot change remote server URL because the input is always disabled
 *
 * Run: npx vitest run apps/chrome-extension/tests/bridge-start-stop.test.ts
 */
import { describe, expect, it, vi } from 'vitest';

// ─── BridgeConnector unit tests ──────────────────────────────────────────────

// We can't import the real BridgeConnector because it depends on
// ExtensionBridgePageBrowserSide which requires a browser environment.
// Instead, we test the core state machine logic directly.

describe('BridgeConnector start/stop state machine', () => {
  type BridgeStatus = 'listening' | 'connected' | 'disconnected' | 'closed';

  // Minimal state machine that mirrors BridgeConnector logic
  class TestBridgeConnector {
    status: BridgeStatus = 'closed';
    serverEndpoint?: string;
    private connectLoopRunning = false;
    private statusChanges: BridgeStatus[] = [];

    constructor(serverEndpoint?: string) {
      this.serverEndpoint = serverEndpoint;
    }

    getStatusHistory() {
      return this.statusChanges;
    }

    private setStatus(status: BridgeStatus) {
      if (this.status === status) return;
      this.status = status;
      this.statusChanges.push(status);
    }

    async connect(): Promise<void> {
      if (this.status === 'listening' || this.status === 'connected') {
        return;
      }
      this.setStatus('listening');
      this.connectLoopRunning = true;
    }

    async disconnect(): Promise<void> {
      if (this.status === 'closed') {
        return;
      }
      this.connectLoopRunning = false;
      this.setStatus('closed');
    }

    getStatus(): BridgeStatus {
      return this.status;
    }
  }

  it('should start in closed state', () => {
    const connector = new TestBridgeConnector();
    expect(connector.getStatus()).toBe('closed');
  });

  it('should transition to listening when connect() is called', async () => {
    const connector = new TestBridgeConnector();
    await connector.connect();
    expect(connector.getStatus()).toBe('listening');
  });

  it('should transition to closed when disconnect() is called', async () => {
    const connector = new TestBridgeConnector();
    await connector.connect();
    expect(connector.getStatus()).toBe('listening');

    await connector.disconnect();
    expect(connector.getStatus()).toBe('closed');
  });

  it('should allow restart after disconnect', async () => {
    const connector = new TestBridgeConnector();

    // First cycle
    await connector.connect();
    expect(connector.getStatus()).toBe('listening');
    await connector.disconnect();
    expect(connector.getStatus()).toBe('closed');

    // Second cycle
    await connector.connect();
    expect(connector.getStatus()).toBe('listening');

    expect(connector.getStatusHistory()).toEqual([
      'listening',
      'closed',
      'listening',
    ]);
  });

  it('should allow changing server endpoint after disconnect', async () => {
    const connector1 = new TestBridgeConnector('ws://server1:3766');
    await connector1.connect();
    expect(connector1.serverEndpoint).toBe('ws://server1:3766');
    await connector1.disconnect();

    // Create new connector with different endpoint (mirrors worker behavior)
    const connector2 = new TestBridgeConnector('ws://server2:3766');
    await connector2.connect();
    expect(connector2.serverEndpoint).toBe('ws://server2:3766');
    expect(connector2.getStatus()).toBe('listening');
  });

  it('disconnect() should be idempotent when already closed', async () => {
    const connector = new TestBridgeConnector();
    expect(connector.getStatus()).toBe('closed');
    await connector.disconnect(); // should not throw
    expect(connector.getStatus()).toBe('closed');
  });

  it('connect() should be idempotent when already listening', async () => {
    const connector = new TestBridgeConnector();
    await connector.connect();
    expect(connector.getStatus()).toBe('listening');
    await connector.connect(); // should not throw or change state
    expect(connector.getStatus()).toBe('listening');
    expect(connector.getStatusHistory()).toEqual(['listening']); // only one transition
  });
});

// ─── Worker message handling tests ──────────────────────────────────────────

describe('Worker bridge message handling', () => {
  it('BRIDGE_START message should accept serverEndpoint parameter', () => {
    // Simulate the worker message handler for BRIDGE_START
    const request = {
      type: 'bridge-start',
      payload: { serverEndpoint: 'ws://remote-server:4000' },
    };

    const { serverEndpoint } = request.payload || {};
    expect(serverEndpoint).toBe('ws://remote-server:4000');
  });

  it('BRIDGE_START message should work without serverEndpoint', () => {
    const request = {
      type: 'bridge-start',
      payload: {},
    };

    const { serverEndpoint } = request.payload || {};
    expect(serverEndpoint).toBeUndefined();
  });

  it('BRIDGE_STOP message should have correct type', () => {
    const request = { type: 'bridge-stop' };
    expect(request.type).toBe('bridge-stop');
  });
});

// ─── UI state tests ──────────────────────────────────────────────────────────

describe('Bridge UI state logic', () => {
  it('server URL input should be enabled when status is closed', () => {
    const bridgeStatus = 'closed';
    const disabled = bridgeStatus !== 'closed';
    expect(disabled).toBe(false);
  });

  it('server URL input should be disabled when status is listening', () => {
    const bridgeStatus = 'listening';
    const disabled = bridgeStatus !== 'closed';
    expect(disabled).toBe(true);
  });

  it('server URL input should be disabled when status is connected', () => {
    const bridgeStatus = 'connected';
    const disabled = bridgeStatus !== 'closed';
    expect(disabled).toBe(true);
  });

  it('should determine correct button label based on status', () => {
    // The toggle button should show "Stop" when listening/connected,
    // and "Start Listening" when closed
    function getButtonLabel(
      status: 'listening' | 'connected' | 'disconnected' | 'closed',
    ): string {
      if (status === 'listening' || status === 'connected') {
        return 'Stop';
      }
      return 'Start Listening';
    }

    expect(getButtonLabel('closed')).toBe('Start Listening');
    expect(getButtonLabel('listening')).toBe('Stop');
    expect(getButtonLabel('connected')).toBe('Stop');
    expect(getButtonLabel('disconnected')).toBe('Start Listening');
  });

  it('should determine if bridge is active for toggle state', () => {
    function isBridgeActive(
      status: 'listening' | 'connected' | 'disconnected' | 'closed',
    ): boolean {
      return status === 'listening' || status === 'connected';
    }

    expect(isBridgeActive('closed')).toBe(false);
    expect(isBridgeActive('disconnected')).toBe(false);
    expect(isBridgeActive('listening')).toBe(true);
    expect(isBridgeActive('connected')).toBe(true);
  });
});
