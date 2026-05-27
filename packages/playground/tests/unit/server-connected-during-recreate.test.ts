import { describe, expect, it } from 'vitest';
import { PlaygroundServer } from '../../src/server';

/**
 * Regression test for the "create agent" form flashing after /cancel.
 *
 * recreateAgent() nulls _activeConnection.agent between destroying the
 * old agent and the factory swapping in a new one. The frontend at
 * PlaygroundConversationPanel.tsx:132 renders SessionSetupPanel whenever
 * sessionViewState.connected is false, so without this guard the UI
 * flashes the "create agent" form for ~1–2 seconds whenever a user
 * hits Stop.
 *
 * isEffectivelyConnected() must return true while _agentReady === false
 * even if agent is null, so the UI stays calm during the recreate window.
 */
describe('PlaygroundServer connected state during recreateAgent', () => {
  function makeFakeAgent() {
    // Minimal stub — the connected check only inspects identity, not methods.
    return {} as any;
  }

  function makeServer() {
    // Pass a factory so recreateAgent has something to swap in.
    return new PlaygroundServer(() => makeFakeAgent());
  }

  it('reports connected=true when an agent is live and not recreating', () => {
    const server = makeServer();
    (server as any)._activeConnection.agent = makeFakeAgent();
    (server as any)._agentReady = true;

    expect(server.getSessionInfo().connected).toBe(true);
  });

  it('reports connected=false at cold start (no agent, not recreating)', () => {
    const server = makeServer();
    (server as any)._activeConnection.agent = null;
    (server as any)._agentReady = true;

    expect(server.getSessionInfo().connected).toBe(false);
  });

  it('reports connected=true during the recreate window (agent=null, _agentReady=false)', () => {
    const server = makeServer();
    // Simulate the exact mid-recreate state: agent has been destroyed
    // but the factory hasn't swapped in the replacement yet.
    (server as any)._activeConnection.agent = null;
    (server as any)._agentReady = false;

    expect(server.getSessionInfo().connected).toBe(true);
  });

  it('flips connected back to false once recreate finishes without a fresh agent', () => {
    const server = makeServer();
    // Recreate window closed (e.g. factory threw), no agent installed.
    (server as any)._activeConnection.agent = null;
    (server as any)._agentReady = true;

    expect(server.getSessionInfo().connected).toBe(false);
  });

  it('surfaces the same guard through buildSessionMetadata().sessionConnected', () => {
    const server = makeServer();
    (server as any)._activeConnection.agent = null;
    (server as any)._agentReady = false;

    const metadata = (server as any).buildSessionMetadata() as {
      sessionConnected: boolean;
    };
    expect(metadata.sessionConnected).toBe(true);
  });
});
