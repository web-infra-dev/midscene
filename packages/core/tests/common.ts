import { type DeviceAction, MidsceneLocation } from '@/index';
import { z } from 'zod';

export const mockActionSpace: DeviceAction<any>[] = [
  {
    name: 'Tap',
    description: 'Tap the element',
    paramSchema: z.object({
      value: z.string().describe('The value to be tapped'),
      locate: MidsceneLocation.describe('The element to be tapped'),
    }),
    call: async () => {},
  },
  {
    name: 'Sleep',
    description: 'Sleep for a period of time',
    paramSchema: z.object({
      timeMs: z.number().describe('The duration of the sleep in milliseconds'),
    }),
    call: async () => {},
  },
  {
    name: 'Input',
    description: 'Input text into the input field',
    paramSchema: z.object({
      value: z.string().describe('The value to be input'),
      locate: MidsceneLocation.optional().describe('The input field to target'),
    }),
    call: async () => {},
  },
  {
    name: 'KeyboardPress',
    description: 'Press a keyboard key',
    paramSchema: z.object({
      value: z.string().describe('The key to be pressed'),
      locate: MidsceneLocation.optional().describe(
        'The element to target for key press',
      ),
    }),
    call: async () => {},
  },
  {
    name: 'Scroll',
    description: 'Scroll the page',
    paramSchema: z.object({
      value: z.string().describe('The scroll direction or amount'),
      locate: MidsceneLocation.optional().describe('The element to scroll'),
    }),
    call: async () => {},
  },
];
