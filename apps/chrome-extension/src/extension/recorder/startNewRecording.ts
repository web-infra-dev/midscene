import type { RecordingSession } from '../../store';

export const startNewRecording = async (
  createNewSession: () => Promise<RecordingSession>,
  startRecording: (sessionId: string) => Promise<void>,
): Promise<RecordingSession> => {
  const session = await createNewSession();
  await startRecording(session.id);
  return session;
};
