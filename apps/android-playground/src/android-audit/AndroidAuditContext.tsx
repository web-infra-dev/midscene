import type {
  AndroidAuditDownloadBundle,
  AndroidAuditState,
} from '@midscene/android-playground';
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  chooseAndroidAuditDownloadDirectory,
  writeAndroidAuditDownloadBundle,
} from './downloadAndroidAuditReport';

const EMPTY_STATE: AndroidAuditState = {
  enabled: false,
  overlays: [],
  replay: { attempted: 0, hits: 0, misses: 0, wrongMappings: 0 },
  revision: 0,
  status: 'idle',
  treeNodes: [],
  visualElements: [],
  visualScan: { status: 'idle' },
};

type InteractionMode = 'device' | 'inspect' | 'mark';

interface AndroidAuditContextValue {
  activate(): void;
  addVisualElement(input: {
    description: string;
    name: string;
    rect: { left: number; top: number; width: number; height: number };
  }): Promise<void>;
  capture(): Promise<void>;
  deactivate(): void;
  downloadingReport: boolean;
  error?: string;
  exportReport(): Promise<void>;
  interactionMode: InteractionMode;
  lastDownloadedReport?: string;
  resume(): Promise<void>;
  selectOverlay(nodeId: string | undefined, visualElementId?: string): void;
  selectionRequest: number;
  selectedNodeId?: string;
  selectedVisualElementId?: string;
  setInteractionMode(mode: InteractionMode): void;
  setRevisitBaseline(): Promise<void>;
  setSelectedNodeId(nodeId: string | undefined): void;
  setSelectedVisualElementId(id: string | undefined): void;
  scanVisualElements(): Promise<void>;
  state: AndroidAuditState;
  verifyRevisit(): Promise<void>;
}

const AndroidAuditContext = createContext<AndroidAuditContextValue | null>(
  null,
);

async function requestJson<T>(
  serverUrl: string,
  path: string,
  method: 'GET' | 'POST' = 'GET',
  body?: unknown,
): Promise<T> {
  const response = await fetch(`${serverUrl}${path}`, {
    method,
    headers: {
      Accept: 'application/json',
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const payload = (await response.json()) as T & {
    error?: string;
  };
  if (!response.ok) {
    throw new Error(
      payload.error || `Android audit request failed (${response.status})`,
    );
  }
  return payload;
}

const requestState = (
  serverUrl: string,
  path: string,
  method?: 'GET' | 'POST',
) => requestJson<AndroidAuditState>(serverUrl, path, method);

export function AndroidAuditProvider({
  children,
  serverUrl,
}: {
  children: ReactNode;
  serverUrl: string;
}) {
  const [state, setState] = useState<AndroidAuditState>(EMPTY_STATE);
  const [error, setError] = useState<string>();
  const [downloadingReport, setDownloadingReport] = useState(false);
  const [lastDownloadedReport, setLastDownloadedReport] = useState<string>();
  const [interactionMode, setInteractionMode] =
    useState<InteractionMode>('device');
  const [selectedNodeId, setSelectedNodeId] = useState<string>();
  const [selectedVisualElementId, setSelectedVisualElementId] =
    useState<string>();
  const [selectionRequest, setSelectionRequest] = useState(0);
  const eventSourceRef = useRef<EventSource | null>(null);
  const activeRef = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const next = await requestState(serverUrl, '/android-audit/state');
      setState(next);
      setError(next.error);
      setSelectedNodeId((current) =>
        current && !next.treeNodes.some((node) => node.nodeId === current)
          ? undefined
          : current,
      );
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : String(requestError),
      );
    }
  }, [serverUrl]);

  const connectEvents = useCallback(() => {
    eventSourceRef.current?.close();
    const source = new EventSource(`${serverUrl}/android-audit/events`);
    source.addEventListener('state', () => void refresh());
    source.onerror = () => {
      if (activeRef.current) {
        setError(
          'The live audit event stream disconnected. Waiting to reconnect.',
        );
      }
    };
    eventSourceRef.current = source;
  }, [refresh, serverUrl]);

  const activate = useCallback(() => {
    if (activeRef.current) return;
    activeRef.current = true;
    setInteractionMode('inspect');
    connectEvents();
    void requestState(serverUrl, '/android-audit/start', 'POST')
      .then((next) => {
        setState(next);
        setError(next.error);
      })
      .catch((requestError) => {
        setError(
          requestError instanceof Error
            ? requestError.message
            : String(requestError),
        );
      });
  }, [connectEvents, serverUrl]);

  const deactivate = useCallback(() => {
    if (!activeRef.current) return;
    activeRef.current = false;
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
    setInteractionMode('device');
    void requestState(serverUrl, '/android-audit/pause', 'POST')
      .then((next) => setState(next))
      .catch(() => undefined);
  }, [serverUrl]);

  const capture = useCallback(async () => {
    try {
      setError(undefined);
      setState(await requestState(serverUrl, '/android-audit/capture', 'POST'));
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : String(requestError),
      );
    }
  }, [serverUrl]);

  const resume = useCallback(async () => {
    try {
      setError(undefined);
      setState(await requestState(serverUrl, '/android-audit/start', 'POST'));
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : String(requestError),
      );
    }
  }, [serverUrl]);

  const runStateOperation = useCallback(
    async (path: string) => {
      try {
        setError(undefined);
        setState(await requestState(serverUrl, path, 'POST'));
      } catch (requestError) {
        setError(
          requestError instanceof Error
            ? requestError.message
            : String(requestError),
        );
      }
    },
    [serverUrl],
  );

  const setRevisitBaseline = useCallback(
    () => runStateOperation('/android-audit/revisit-baseline'),
    [runStateOperation],
  );

  const verifyRevisit = useCallback(
    () => runStateOperation('/android-audit/revisit-verify'),
    [runStateOperation],
  );

  const exportReport = useCallback(async () => {
    try {
      setError(undefined);
      const directory = await chooseAndroidAuditDownloadDirectory();
      if (!directory) return;
      setDownloadingReport(true);
      setLastDownloadedReport(undefined);
      const bundle = await requestJson<AndroidAuditDownloadBundle>(
        serverUrl,
        '/android-audit/export',
        'POST',
      );
      setLastDownloadedReport(
        await writeAndroidAuditDownloadBundle(directory, bundle),
      );
      await refresh();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : String(requestError),
      );
    } finally {
      setDownloadingReport(false);
    }
  }, [refresh, serverUrl]);

  const scanVisualElements = useCallback(
    () => runStateOperation('/android-audit/visual-scan'),
    [runStateOperation],
  );

  const addVisualElement = useCallback(
    async (input: {
      description: string;
      name: string;
      rect: { left: number; top: number; width: number; height: number };
    }) => {
      try {
        const elements = [
          ...state.visualElements.map((element) => ({
            description: element.description,
            id: element.id,
            name: element.name,
            rect: element.rect,
            rectSource: element.rectSource,
          })),
          {
            ...input,
            id: `manual-${Date.now()}`,
            rectSource: 'manual' as const,
          },
        ];
        setState(
          await requestJson<AndroidAuditState>(
            serverUrl,
            '/android-audit/visual-elements',
            'POST',
            { elements },
          ),
        );
        setInteractionMode('inspect');
      } catch (requestError) {
        setError(
          requestError instanceof Error
            ? requestError.message
            : String(requestError),
        );
      }
    },
    [serverUrl, state.visualElements],
  );

  const selectOverlay = useCallback(
    (nodeId: string | undefined, visualElementId?: string) => {
      setSelectedNodeId(nodeId);
      setSelectedVisualElementId(visualElementId);
      setSelectionRequest((request) => request + 1);
    },
    [],
  );

  const value = useMemo<AndroidAuditContextValue>(
    () => ({
      activate,
      addVisualElement,
      capture,
      deactivate,
      downloadingReport,
      error,
      exportReport,
      interactionMode,
      lastDownloadedReport,
      resume,
      selectOverlay,
      selectionRequest,
      selectedNodeId,
      selectedVisualElementId,
      scanVisualElements,
      setInteractionMode,
      setRevisitBaseline,
      setSelectedNodeId,
      setSelectedVisualElementId,
      state,
      verifyRevisit,
    }),
    [
      activate,
      addVisualElement,
      capture,
      deactivate,
      downloadingReport,
      error,
      exportReport,
      interactionMode,
      lastDownloadedReport,
      resume,
      selectOverlay,
      selectionRequest,
      selectedNodeId,
      selectedVisualElementId,
      scanVisualElements,
      setRevisitBaseline,
      state,
      verifyRevisit,
    ],
  );

  return (
    <AndroidAuditContext.Provider value={value}>
      {children}
    </AndroidAuditContext.Provider>
  );
}

export function useAndroidAudit(): AndroidAuditContextValue {
  const context = useContext(AndroidAuditContext);
  if (!context) {
    throw new Error('useAndroidAudit must be used inside AndroidAuditProvider');
  }
  return context;
}
