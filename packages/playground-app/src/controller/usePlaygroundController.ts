import type { PlaygroundSessionSetup } from '@midscene/playground';
import { PlaygroundSDK } from '@midscene/playground';
import { type DeviceType, useEnvConfig } from '@midscene/visualizer';
import { Form, message } from 'antd';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { resolveAutoCreateSessionInput } from '../session-setup';
import {
  buildSessionInitialValues,
  resolveSessionViewState,
} from '../session-state';
import { useServerStatus } from '../useServerStatus';
import {
  applyPlaygroundAiConfig,
  hasPlaygroundAiConfig,
  serializePlaygroundAiConfig,
} from './ai-config';
import {
  resolveAutoCreateDecision,
  serializeAutoCreateInput,
  shouldResetAutoCreateBlock,
} from './auto-create';
import { runSingleFlight } from './single-flight';
import type { PlaygroundControllerResult, PlaygroundFormValues } from './types';

function getPlatformSelectorFieldKey(
  setup: PlaygroundSessionSetup | null,
): string | undefined {
  return setup?.platformSelector?.fieldKey;
}

export interface UsePlaygroundControllerOptions {
  serverUrl: string;
  defaultDeviceType?: DeviceType;
  pollIntervalMs?: number;
  countdownSeconds?: number;
  /**
   * Seed values written into the session-setup form on the first render.
   * Useful for pre-selecting a default platform so the initial
   * `refreshSessionSetup` poll already has a `platformId`, instead of
   * returning a generic "Choose a platform" setup.
   */
  initialFormValues?: Record<string, unknown>;
}

export function usePlaygroundController({
  serverUrl,
  defaultDeviceType = 'web',
  pollIntervalMs = 5000,
  countdownSeconds = 3,
  initialFormValues,
}: UsePlaygroundControllerOptions): PlaygroundControllerResult {
  const [form] = Form.useForm<PlaygroundFormValues>();
  const initialFormValuesRef = useRef(initialFormValues);
  // Seed the form ONCE before paint. Later prop changes are ignored so
  // the user's in-flight edits never get overwritten.
  useLayoutEffect(() => {
    const seed = initialFormValuesRef.current;
    if (!seed) {
      return;
    }
    for (const [key, value] of Object.entries(seed)) {
      if (form.getFieldValue(key) === undefined) {
        form.setFieldsValue({ [key]: value } as Partial<PlaygroundFormValues>);
      }
    }
  }, [form]);
  const formValues = (Form.useWatch([], form) ?? {}) as Record<string, unknown>;
  const [countdown, setCountdown] = useState<number | string | null>(null);
  const [sessionSetup, setSessionSetup] =
    useState<PlaygroundSessionSetup | null>(null);
  const [sessionSetupError, setSessionSetupError] = useState<string | null>(
    null,
  );
  const [sessionLoading, setSessionLoading] = useState(false);
  const [sessionMutating, setSessionMutating] = useState(false);
  const aiConfig = useEnvConfig((state) => state.config);
  const aiConfigSignature = useMemo(
    () => serializePlaygroundAiConfig(aiConfig),
    [aiConfig],
  );
  const platformSelectorFieldKey = getPlatformSelectorFieldKey(sessionSetup);
  const selectedPlatformId =
    typeof platformSelectorFieldKey === 'string'
      ? formValues[platformSelectorFieldKey]
      : undefined;

  const playgroundSDK = useMemo(
    () =>
      new PlaygroundSDK({
        type: 'remote-execution',
        serverUrl,
      }),
    [serverUrl],
  );

  const {
    serverOnline,
    isUserOperating,
    deviceType,
    runtimeInfo,
    executionUxHints,
    refreshServerState,
  } = useServerStatus(playgroundSDK, defaultDeviceType, pollIntervalMs);
  const sessionViewState = useMemo(
    () => resolveSessionViewState(runtimeInfo),
    [runtimeInfo],
  );
  const countdownTimerRef = useRef<number | null>(null);
  const countdownResolveRef = useRef<(() => void) | null>(null);
  const mountedRef = useRef(true);
  const lastSetupPlatformIdRef = useRef<string | undefined>(undefined);
  const autoCreateSignatureRef = useRef<string | null>(null);
  const autoCreateBlockedSignatureRef = useRef<string | null>(null);
  const sessionMutatingRef = useRef(false);
  const appliedAiConfigSignatureRef = useRef<string | null>(null);
  const pendingCreateSessionRef = useRef<Promise<boolean> | null>(null);
  const pendingAiConfigApplicationRef = useRef<{
    promise: Promise<boolean>;
    signature: string;
  } | null>(null);

  const applyAiConfig = useCallback(async () => {
    if (!hasPlaygroundAiConfig(aiConfig)) {
      appliedAiConfigSignatureRef.current = null;
      pendingAiConfigApplicationRef.current = null;
      return true;
    }

    if (appliedAiConfigSignatureRef.current === aiConfigSignature) {
      return true;
    }

    const pendingApplication = pendingAiConfigApplicationRef.current;
    if (pendingApplication?.signature === aiConfigSignature) {
      return pendingApplication.promise;
    }

    const pendingApplicationState = {
      promise: Promise.resolve(true) as Promise<boolean>,
      signature: aiConfigSignature,
    };
    const applyPromise = (async () => {
      try {
        await applyPlaygroundAiConfig(playgroundSDK, aiConfig);
        appliedAiConfigSignatureRef.current = aiConfigSignature;
        return true;
      } catch (error) {
        const errorMessage =
          error instanceof Error
            ? error.message
            : 'Failed to apply AI configuration';
        message.error(errorMessage);
        return false;
      } finally {
        if (pendingAiConfigApplicationRef.current === pendingApplicationState) {
          pendingAiConfigApplicationRef.current = null;
        }
      }
    })();

    pendingApplicationState.promise = applyPromise;
    pendingAiConfigApplicationRef.current = pendingApplicationState;
    return applyPromise;
  }, [aiConfig, aiConfigSignature, playgroundSDK]);

  const finishCountdown = useCallback(() => {
    if (countdownTimerRef.current !== null) {
      window.clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }

    const resolve = countdownResolveRef.current;
    countdownResolveRef.current = null;

    if (mountedRef.current) {
      setCountdown(null);
    }

    resolve?.();
  }, []);

  const showCountdownModal = useCallback(async () => {
    if (countdownSeconds <= 0) {
      return;
    }

    finishCountdown();

    return new Promise<void>((resolve) => {
      countdownResolveRef.current = resolve;
      let count = countdownSeconds;

      if (mountedRef.current) {
        setCountdown(count);
      }

      countdownTimerRef.current = window.setInterval(() => {
        count -= 1;
        if (count > 0) {
          if (mountedRef.current) {
            setCountdown(count);
          }
          return;
        }

        if (count === 0) {
          if (mountedRef.current) {
            setCountdown('GO!');
          }
          return;
        }

        finishCountdown();
      }, 1000);
    });
  }, [countdownSeconds, finishCountdown]);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      finishCountdown();
    };
  }, [finishCountdown]);

  useEffect(() => {
    if (!executionUxHints.includes('countdown-before-run')) {
      playgroundSDK.setBeforeActionHook(undefined);
      return;
    }

    playgroundSDK.setBeforeActionHook(async () => {
      await showCountdownModal();
    });

    return () => {
      playgroundSDK.setBeforeActionHook(undefined);
    };
  }, [executionUxHints, playgroundSDK, showCountdownModal]);

  const refreshSessionSetup = useCallback(
    async (input?: Record<string, unknown>) => {
      const currentValues = {
        ...form.getFieldsValue(true),
        ...(input || {}),
      } as PlaygroundFormValues;

      setSessionLoading(true);
      try {
        const setup = await playgroundSDK.getSessionSetup(input);
        setSessionSetup(setup);
        setSessionSetupError(null);
        const currentPlatformSelectorFieldKey =
          getPlatformSelectorFieldKey(setup);
        lastSetupPlatformIdRef.current =
          currentPlatformSelectorFieldKey &&
          typeof currentValues[currentPlatformSelectorFieldKey] === 'string'
            ? (currentValues[currentPlatformSelectorFieldKey] as string)
            : undefined;
        form.setFieldsValue(
          buildSessionInitialValues(
            setup,
            currentValues,
          ) as PlaygroundFormValues,
        );
      } catch (error) {
        console.error('Failed to load session setup:', error);
        setSessionSetupError(
          error instanceof Error
            ? error.message
            : 'Failed to load session setup',
        );
      } finally {
        setSessionLoading(false);
      }
    },
    [form, playgroundSDK],
  );

  const createSession = useCallback(
    async (
      input?: Record<string, unknown>,
      options?: { silent?: boolean },
    ): Promise<boolean> =>
      runSingleFlight(pendingCreateSessionRef, async () => {
        try {
          sessionMutatingRef.current = true;
          setSessionMutating(true);
          if (!(await applyAiConfig())) {
            return false;
          }

          const values = input ?? (await form.validateFields());
          await playgroundSDK.createSession(values);
          if (shouldResetAutoCreateBlock(options)) {
            autoCreateBlockedSignatureRef.current = null;
          }
          if (!options?.silent) {
            message.success('Agent created');
          }
          await refreshServerState();
          return true;
        } catch (error) {
          if ((error as { errorFields?: unknown }).errorFields) {
            return false;
          }

          const errorMessage =
            error instanceof Error ? error.message : 'Failed to create Agent';
          message.error(errorMessage);
          return false;
        } finally {
          sessionMutatingRef.current = false;
          setSessionMutating(false);
        }
      }),
    [applyAiConfig, form, playgroundSDK, refreshServerState],
  );

  const destroySession = useCallback(async () => {
    try {
      autoCreateBlockedSignatureRef.current = serializeAutoCreateInput(
        resolveAutoCreateSessionInput(sessionSetup, form.getFieldsValue(true)),
      );
      sessionMutatingRef.current = true;
      setSessionMutating(true);
      await playgroundSDK.destroySession();
      message.success('Session disconnected');
      await refreshServerState();
      await refreshSessionSetup();
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to disconnect session';
      message.error(errorMessage);
    } finally {
      sessionMutatingRef.current = false;
      setSessionMutating(false);
    }
  }, [
    form,
    playgroundSDK,
    refreshServerState,
    refreshSessionSetup,
    sessionSetup,
  ]);

  useEffect(() => {
    if (!serverOnline) {
      return;
    }

    void applyAiConfig();
  }, [applyAiConfig, serverOnline]);

  useEffect(() => {
    if (!serverOnline || sessionViewState.connected) {
      return;
    }

    let disposed = false;
    let refreshing = false;

    const refreshTargets = async () => {
      if (disposed || refreshing) {
        return;
      }

      refreshing = true;
      try {
        await refreshSessionSetup(form.getFieldsValue(true));
      } finally {
        refreshing = false;
      }
    };

    void refreshTargets();

    const intervalId = window.setInterval(() => {
      void refreshTargets();
    }, pollIntervalMs);

    return () => {
      disposed = true;
      window.clearInterval(intervalId);
    };
  }, [
    form,
    pollIntervalMs,
    refreshSessionSetup,
    serverOnline,
    sessionViewState.connected,
  ]);

  useEffect(() => {
    if (!serverOnline || sessionViewState.connected || !selectedPlatformId) {
      return;
    }

    const currentPlatformSelectorFieldKey =
      getPlatformSelectorFieldKey(sessionSetup);
    if (!currentPlatformSelectorFieldKey) {
      return;
    }

    if (lastSetupPlatformIdRef.current === selectedPlatformId) {
      return;
    }

    void refreshSessionSetup({
      ...form.getFieldsValue(true),
      [currentPlatformSelectorFieldKey]: selectedPlatformId,
    });
  }, [
    form,
    refreshSessionSetup,
    selectedPlatformId,
    serverOnline,
    sessionSetup,
    sessionViewState.connected,
  ]);

  useEffect(() => {
    if (sessionViewState.connected) {
      autoCreateSignatureRef.current = null;
      return;
    }

    if (
      !serverOnline ||
      sessionLoading ||
      sessionMutating ||
      sessionMutatingRef.current ||
      sessionSetupError
    ) {
      return;
    }

    const autoCreateInput = resolveAutoCreateSessionInput(
      sessionSetup,
      form.getFieldsValue(true),
    );
    const { signature, shouldCreate } = resolveAutoCreateDecision({
      autoCreateInput,
      lastAttemptedSignature: autoCreateSignatureRef.current,
      blockedSignature: autoCreateBlockedSignatureRef.current,
    });

    if (!shouldCreate || !signature) {
      if (!signature) {
        autoCreateSignatureRef.current = null;
      }
      return;
    }

    autoCreateSignatureRef.current = signature;

    void (async () => {
      const created = await createSession(autoCreateInput ?? undefined, {
        silent: true,
      });
      if (!created) {
        autoCreateSignatureRef.current = null;
      }
    })();
  }, [
    createSession,
    form,
    serverOnline,
    sessionLoading,
    sessionMutating,
    sessionSetup,
    sessionSetupError,
    sessionViewState.connected,
  ]);

  return {
    state: {
      playgroundSDK,
      form,
      formValues,
      serverOnline,
      isUserOperating,
      deviceType,
      runtimeInfo,
      executionUxHints,
      sessionViewState,
      sessionSetup,
      sessionSetupError,
      sessionLoading,
      sessionMutating,
      countdown,
      countdownSeconds,
    },
    actions: {
      refreshServerState,
      refreshSessionSetup,
      createSession,
      destroySession,
      finishCountdown,
    },
  };
}
