import { EventRecorder } from './recorder';

declare global {
  interface Window {
    EventRecorder: typeof EventRecorder;
  }
}

window.EventRecorder = EventRecorder;
// const eventRecorder = new EventRecorder((event) => {
//   console.log(event);
// });

// eventRecorder.start();
