import { EventRecorder } from './record';

const eventRecorder = new EventRecorder((event) => {
  console.log(event);
});

eventRecorder.start();
