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
        console.log('[LifecycleCleanup] Extension popup hidden, stopping recording');
        stopRecording().then(() => {
          message.warning('Recording stopped - left extension popup');
        });
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Handle potential popup window close
    const handleBeforeUnload = () => {
      if (isRecording) {
        console.log('[LifecycleCleanup] Extension popup closing, stopping recording synchronously');
        // For unload events, we need to stop synchronously
        setIsRecording(false);
        if (currentSessionId) {
          const session = getCurrentSession();
          if (session) {
            console.log('[LifecycleCleanup] Updating session status to completed on unload');
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
        console.log('[LifecycleCleanup] Component unmounting, cleaning up recording');
        setIsRecording(false);
        if (currentSessionId) {
          const session = getCurrentSession();
          if (session) {
            console.log('[LifecycleCleanup] Updating session status to completed on unmount');
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
