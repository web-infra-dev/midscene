import { EventRecorder } from './recorder';

declare global {
  interface Window {
    EventRecorder: typeof EventRecorder;
  }
}

window.EventRecorder = EventRecorder;
//@ts-ignore
// let events = [];
// const eventRecorder = new EventRecorder((event) => {
//@ts-ignore
//   const res = eventRecorder.optimizeEvent(event, events);
//   events = res;
//   console.log('eventRecorder', res);
// }, '123');

// eventRecorder.start();
