export function isStudioRecorderEntryEnabled() {
  if (typeof window === 'undefined') {
    return false;
  }
  return window.studioRuntime?.recorderEntryEnabled === true;
}
