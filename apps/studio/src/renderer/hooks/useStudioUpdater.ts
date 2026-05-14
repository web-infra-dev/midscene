import { useCallback, useEffect, useState } from 'react';
import type {
  UpdateChannel,
  UpdateStatus,
} from '../../shared/updater-contract';

const isUpdateStatus = (value: unknown): value is UpdateStatus => {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { state?: unknown }).state === 'string'
  );
};

const getUpdaterApi = () => window.studioUpdater;

export interface UseStudioUpdaterResult {
  status: UpdateStatus;
  /** True while the user-initiated check is in flight or the update can be installed. */
  hasUpdateReady: boolean;
  appVersion: string | null;
  check: () => Promise<void>;
  download: () => Promise<void>;
  install: () => Promise<void>;
  setAutoDownload: (enabled: boolean) => Promise<void>;
  setChannel: (channel: UpdateChannel) => Promise<void>;
}

export function useStudioUpdater(): UseStudioUpdaterResult {
  const [status, setStatus] = useState<UpdateStatus>({ state: 'idle' });
  const [appVersion, setAppVersion] = useState<string | null>(null);

  useEffect(() => {
    const api = getUpdaterApi();
    if (!api) return;

    let cancelled = false;
    void api.getStatus().then((current) => {
      if (!cancelled && isUpdateStatus(current)) {
        setStatus(current);
      }
    });
    void api.getVersion().then((version) => {
      if (!cancelled) setAppVersion(version);
    });

    const cleanup = api.onStatus((next) => {
      if (isUpdateStatus(next)) {
        setStatus(next);
      }
    });
    return () => {
      cancelled = true;
      cleanup();
    };
  }, []);

  const check = useCallback(async () => {
    const api = getUpdaterApi();
    if (!api) return;
    setStatus({ state: 'checking' });
    const result = await api.check();
    // `update-available` arrives via onStatus; only correct the optimistic
    // checking state when the main process did not promote it further.
    if (!isUpdateStatus(result)) return;
    setStatus((prev) => (prev.state === 'checking' ? result : prev));
  }, []);

  const download = useCallback(async () => {
    const api = getUpdaterApi();
    if (!api) return;
    await api.download();
  }, []);

  const install = useCallback(async () => {
    const api = getUpdaterApi();
    if (!api) return;
    await api.install();
  }, []);

  const setAutoDownload = useCallback(async (enabled: boolean) => {
    const api = getUpdaterApi();
    if (!api) return;
    await api.setAutoDownload(enabled);
  }, []);

  const setChannel = useCallback(async (channel: UpdateChannel) => {
    const api = getUpdaterApi();
    if (!api) return;
    await api.setChannel(channel);
  }, []);

  const hasUpdateReady =
    status.state === 'available' || status.state === 'downloaded';

  return {
    status,
    hasUpdateReady,
    appVersion,
    check,
    download,
    install,
    setAutoDownload,
    setChannel,
  };
}
