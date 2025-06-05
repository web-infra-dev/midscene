import { message } from 'antd';
import { useEffect } from 'react';
import type { RecordingSession } from '../../../store';

export const useLifecycleCleanup = (
  isRecording: boolean,
  stopRecording: () => Promise<void>,
  setIsRecording: (recording: boolean) => void,
  currentSessionId: string | null,
  getCurrentSession: () => RecordingSession | null,
  updateSession: (
    sessionId: string,
    updates: Partial<RecordingSession>,
  ) => void,
) => {
  // Monitor visibility changes for the extension popup
  useEffect(() => {
    if (!isRecording) return;

    // Handle when user navigates away from extension popup
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && isRecording) {
        stopRecording().then(() => {
          message.warning('Recording stopped - left extension popup');
        });
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Handle potential popup window close
    const handleBeforeUnload = () => {
      if (isRecording) {
        // For unload events, we need to stop synchronously
        setIsRecording(false);
        if (currentSessionId) {
          const session = getCurrentSession();
          if (session) {
            updateSession(currentSessionId, {
              status: 'completed',
              updatedAt: Date.now(),
            });
          }
        }
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [
    isRecording,
    stopRecording,
    setIsRecording,
    currentSessionId,
    getCurrentSession,
    updateSession,
  ]);

  // Cleanup on component unmount
  useEffect(() => {
    return () => {
      // Clean up any ongoing recording when component unmounts
      if (isRecording) {
        setIsRecording(false);
        if (currentSessionId) {
          const session = getCurrentSession();
          if (session) {
            updateSession(currentSessionId, {
              status: 'completed',
              updatedAt: Date.now(),
            });
          }
        }
      }
    };
  }, []); // Empty dependency array means this runs only on unmount
};
