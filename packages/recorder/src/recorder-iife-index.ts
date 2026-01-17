import { EventRecorder } from './recorder';

declare global {
  interface Window {
    EventRecorder: typeof EventRecorder;
  }
}

window.EventRecorder = EventRecorder;
