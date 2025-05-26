declare module 'rrweb' {
  export interface eventWithTime {
    type: number;
    data: any;
    timestamp: number;
  }

  export interface RecordOptions {
    emit: (event: eventWithTime) => void;
    sampling?: {
      scroll?: number;
      input?: string;
      mouseInteraction?: {
        Click?: boolean;
        MouseDown?: boolean;
        MouseUp?: boolean;
      };
    };
    ignoreClass?: string;
    maskAllInputs?: boolean;
    maskInputOptions?: {
      password?: boolean;
    };
  }

  export function record(options: RecordOptions): () => void;
}

declare module 'rrweb/typings/types' {
  export interface eventWithTime {
    type: number;
    data: any;
    timestamp: number;
  }
}
