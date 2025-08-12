import type { DeviceAction } from '@/types';

export const mockActionSpace: DeviceAction[] = [
  {
    name: 'Tap',
    description: 'Tap the element',
    location: 'required',
    whatToLocate: 'The element to be tapped',
    paramSchema: '{ value: string }',
    paramDescription: 'The value to be tapped',
    call: async () => {},
  },
  {
    name: 'Sleep',
    description: 'Sleep for a period of time',
    paramSchema: '{ timeMs: number }',
    paramDescription: 'The duration of the sleep in milliseconds',
    location: false,
    call: async () => {},
  },
  {
    name: 'Input',
    description: 'Input text into the input field',
    paramSchema: '{ value: string }',
    paramDescription: 'The value to be input',
    location: 'optional',
    call: async () => {},
  },
  {
    name: 'KeyboardPress',
    description: 'Press a keyboard key',
    paramSchema: '{ value: string }',
    paramDescription: 'The value to be input',
    location: 'optional',
    call: async () => {},
  },
  {
    name: 'Scroll',
    description: 'Scroll the page',
    paramSchema: '{ value: string }',
    paramDescription: 'The value to be input',
    location: 'optional',
    call: async () => {},
  },
];
