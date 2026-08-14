import type { AdbServerClient, AdbServerTransport } from '@yume-chan/adb';

/**
 * Create an ADB transport without leaking a rejected disconnect monitor.
 *
 * @yume-chan/adb@2.5.1 registers its abort cleanup with an ignored `finally`
 * promise. When `waitForDisconnect` rejects, that derived promise rejects too
 * and becomes an unhandled rejection. Register both outcomes explicitly so the
 * cleanup promise always resolves while `transport.disconnected` keeps its
 * original rejection semantics.
 */
export async function createAdbServerTransport(
  client: AdbServerClient,
  serial: string,
): Promise<AdbServerTransport> {
  const [{ AdbBanner, AdbServerTransport }, { AbortController }] =
    await Promise.all([
      import('@yume-chan/adb'),
      import('@yume-chan/stream-extra'),
    ]);

  const { transportId, features } = await client.getDeviceFeatures({ serial });
  const devices = await client.getDevices();
  const info = devices.find((item) => item.transportId === transportId);
  const banner = new AdbBanner(
    info?.product,
    info?.model,
    info?.device,
    features,
  );

  const waitAbortController = new AbortController();
  const disconnected = client.waitForDisconnect(transportId, {
    unref: true,
    signal: waitAbortController.signal,
  });
  const transport = new AdbServerTransport(
    client,
    info?.serial ?? serial,
    banner,
    transportId,
    disconnected,
  );

  const abortDisconnectWait = () => waitAbortController.abort();
  void transport.disconnected.then(abortDisconnectWait, abortDisconnectWait);

  return transport;
}
