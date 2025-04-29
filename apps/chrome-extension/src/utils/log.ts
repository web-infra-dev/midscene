/**
 * Simple logging utility for Smart Shopping Assistant study
 * 
 * This lightweight implementation stores logs in localStorage
 * without external dependencies. Logs can be exported for analysis.
 */

// Constants
const LOG_STORAGE_KEY = 'smart_shopping_study_logs';
const PARTICIPANT_ID_KEY = 'smart_shopping_participant_id';
const CONDITION_KEY = 'smart_shopping_condition';

// Types
type StudyCondition = 'baseline' | 'assistant';

/**
 * Generates a stable participant ID or retrieves existing one
 */
export function getParticipantId(): string {
  let participantId = localStorage.getItem(PARTICIPANT_ID_KEY);
  
  if (!participantId) {
    participantId = 'p_' + Math.random().toString(36).substring(2, 12);
    localStorage.setItem(PARTICIPANT_ID_KEY, participantId);
  }
  
  return participantId;
}

/**
 * Gets the current study condition (baseline or assistant)
 */
export function getStudyCondition(): StudyCondition {
  const condition = localStorage.getItem(CONDITION_KEY) as StudyCondition | null;
  return condition || 'assistant'; // Default to assistant if not set
}

/**
 * Sets the current study condition
 */
export function setStudyCondition(condition: StudyCondition): void {
  localStorage.setItem(CONDITION_KEY, condition);
}

/**
 * Logs a study event to localStorage
 */
export function logStudyEvent(event: Record<string, any>): void {
  try {
    // Enrich the event with participant info
    const enrichedEvent = {
      ...event,
      participant_id: getParticipantId(),
      condition: getStudyCondition(),
      timestamp: new Date().toISOString()
    };
    
    // Log locally for debugging
    console.log('📊 Study event:', enrichedEvent);
    
    // Append to localStorage
    const logs = JSON.parse(localStorage.getItem(LOG_STORAGE_KEY) || '[]');
    logs.push(enrichedEvent);
    localStorage.setItem(LOG_STORAGE_KEY, JSON.stringify(logs));
  } catch (error) {
    console.warn('Failed to log study event:', error);
  }
}

/**
 * Exports all study logs as a JSON string
 * 
 * This can be used by researchers to collect data after the study
 */
export function exportStudyLogs(): string {
  return localStorage.getItem(LOG_STORAGE_KEY) || '[]';
}

/**
 * Clears all study logs (use with caution)
 */
export function clearStudyLogs(): void {
  localStorage.removeItem(LOG_STORAGE_KEY);
}

/**
 * Helper function to toggle study condition (for researcher use)
 */
export function toggleStudyCondition(): void {
  const currentCondition = getStudyCondition();
  const newCondition: StudyCondition = currentCondition === 'baseline' ? 'assistant' : 'baseline';
  setStudyCondition(newCondition);
  
  alert(`Switched study condition from ${currentCondition} to ${newCondition}`);
  
  // Log the condition change
  logStudyEvent({
    type: 'condition_changed',
    from: currentCondition,
    to: newCondition
  });
}

/**
 * Adds a keyboard shortcut to toggle study condition 
 * (Ctrl+Shift+S, for researcher use only)
 */
export function setupStudyControls(): void {
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && e.key === 'S') {
      toggleStudyCondition();
    }
    
    // Ctrl+Shift+E to export logs
    if (e.ctrlKey && e.shiftKey && e.key === 'E') {
      const logs = exportStudyLogs();
      
      // Create a blob and download link
      const blob = new Blob([logs], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `study_logs_${getParticipantId()}_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      alert('Study logs exported');
    }
  });
}