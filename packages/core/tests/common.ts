import { type DeviceAction, getMidsceneLocationSchema } from '@/index';
import { z } from 'zod';

export const mockActionSpace: DeviceAction<any>[] = [
  {
    name: 'Tap',
    description: 'Tap the element',
    paramSchema: z.object({
      locate: getMidsceneLocationSchema().describe('The element to be tapped'),
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
      locate: getMidsceneLocationSchema()
        .optional()
        .describe('The input field to target'),
    }),
    sample: {
      value: 'test@example.com',
      locate: { prompt: 'the email input field' },
    },
    call: async () => {},
  },
  {
    name: 'KeyboardPress',
    description: 'Press a keyboard key',
    paramSchema: z.object({
      value: z.string().describe('The key to be pressed'),
      locate: getMidsceneLocationSchema()
        .optional()
        .describe('The element to target for key press'),
    }),
    call: async () => {},
  },
  {
    name: 'Scroll',
    description: 'Scroll the page',
    paramSchema: z.object({
      value: z.string().describe('The scroll direction or amount'),
      locate: getMidsceneLocationSchema()
        .optional()
        .describe('The element to scroll'),
    }),
    sample: {
      value: 'down',
      locate: { prompt: 'the product list area' },
    },
    call: async () => {},
  },
  {
    name: 'DragAndDrop',
    description: 'Drag an element to another position',
    paramSchema: z.object({
      from: getMidsceneLocationSchema().describe('The element to drag'),
      to: getMidsceneLocationSchema().describe('The drop target'),
    }),
    sample: {
      from: { prompt: 'the "report.pdf" file icon' },
      to: { prompt: 'the upload drop zone' },
    },
    call: async () => {},
  },
];
