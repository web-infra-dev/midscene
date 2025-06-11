export const TEXT_SIZE_THRESHOLD = 9;

export const TEXT_MAX_SIZE = 40;

export const CONTAINER_MINI_HEIGHT = 3;
export const CONTAINER_MINI_WIDTH = 3;

export enum NodeType {
  CONTAINER = 'CONTAINER Node',
  FORM_ITEM = 'FORM_ITEM Node',
  BUTTON = 'BUTTON Node',
  A = 'Anchor Node',
  IMG = 'IMG Node',
  TEXT = 'TEXT Node',
  POSITION = 'POSITION Node',
}

export const PLAYGROUND_SERVER_PORT = 5800;
export const SCRCPY_SERVER_PORT = 5700;

export const DEFAULT_WAIT_FOR_NAVIGATION_TIMEOUT = 5000;
export const DEFAULT_WAIT_FOR_NETWORK_IDLE_TIMEOUT = 2000;
export const DEFAULT_WAIT_FOR_NETWORK_IDLE_TIME = 300;
export const DEFAULT_WAIT_FOR_NETWORK_IDLE_CONCURRENCY = 2;

export { PLAYWRIGHT_EXAMPLE_CODE, YAML_EXAMPLE_CODE } from './example-code';
