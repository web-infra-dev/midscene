import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    clear: vi.fn(() => {
      store = {};
    }),
  };
})();

// Mock window
vi.stubGlobal('localStorage', localStorageMock);
vi.stubGlobal('window', {
  location: { search: '', href: '' },
});

interface MockAnimationScript {
  type: string;
  taskId?: string;
  img?: string;
  duration: number;
  camera?: { left: number; top: number; width: number };
  insightCameraDuration?: number;
  imageWidth?: number;
  imageHeight?: number;
}

describe('Play From Any Position Feature', () => {
  const mockScripts: MockAnimationScript[] = [
    { type: 'img', taskId: 'task-1', img: 'img1', duration: 500 },
    {
      type: 'insight',
      taskId: 'task-1',
      img: 'img2',
      duration: 800,
      camera: { left: 0, top: 0, width: 100 },
      insightCameraDuration: 400,
    },
    { type: 'sleep', taskId: 'task-2', duration: 300 },
    { type: 'img', taskId: 'task-2', img: 'img3', duration: 500 },
    { type: 'clear-insight', taskId: 'task-3', duration: 200 },
    { type: 'img', taskId: 'task-3', img: 'img4', duration: 500 },
    { type: 'img', taskId: undefined, duration: 200 }, // End frame
  ];

  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  describe('Finding start index by taskId', () => {
    it('should find correct start index for task-1', () => {
      const startFromTaskId = 'task-1';
      const foundIndex = mockScripts.findIndex(
        (item) => item.taskId === startFromTaskId,
      );
      expect(foundIndex).toBe(0);
    });

    it('should find correct start index for task-2', () => {
      const startFromTaskId = 'task-2';
      const foundIndex = mockScripts.findIndex(
        (item) => item.taskId === startFromTaskId,
      );
      expect(foundIndex).toBe(2); // First script with task-2
    });

    it('should find correct start index for task-3', () => {
      const startFromTaskId = 'task-3';
      const foundIndex = mockScripts.findIndex(
        (item) => item.taskId === startFromTaskId,
      );
      expect(foundIndex).toBe(4); // First script with task-3
    });

    it('should return -1 for non-existent taskId', () => {
      const startFromTaskId = 'non-existent';
      const foundIndex = mockScripts.findIndex(
        (item) => item.taskId === startFromTaskId,
      );
      expect(foundIndex).toBe(-1);
    });
  });

  describe('Slicing scripts from start position', () => {
    it('should slice scripts correctly from task-2', () => {
      const startFromTaskId = 'task-2';
      const foundIndex = mockScripts.findIndex(
        (item) => item.taskId === startFromTaskId,
      );
      // foundIndex >= 0 means a match was found
      const startIndex = foundIndex >= 0 ? foundIndex : 0;
      const scriptsToPlay = mockScripts.slice(startIndex);

      expect(scriptsToPlay.length).toBe(5); // Scripts from index 2 onwards
      expect(scriptsToPlay[0].taskId).toBe('task-2');
    });

    it('should play all scripts when taskId not found', () => {
      const startFromTaskId = 'non-existent';
      const foundIndex = mockScripts.findIndex(
        (item) => item.taskId === startFromTaskId,
      );
      // foundIndex is -1 when not found, so startIndex defaults to 0
      const startIndex = foundIndex >= 0 ? foundIndex : 0;
      const scriptsToPlay = mockScripts.slice(startIndex);

      expect(scriptsToPlay.length).toBe(mockScripts.length);
    });

    it('should play all scripts when startFromTaskId is null', () => {
      const startFromTaskId = null;
      const startIndex = 0; // Default behavior
      const scriptsToPlay = mockScripts.slice(startIndex);

      expect(scriptsToPlay.length).toBe(mockScripts.length);
    });
  });

  describe('Total duration calculation from start position', () => {
    const calculateDuration = (scripts: MockAnimationScript[]) => {
      return scripts.reduce((acc, item) => {
        return (
          acc +
          item.duration +
          (item.camera && item.insightCameraDuration
            ? item.insightCameraDuration
            : 0)
        );
      }, 0);
    };

    it('should calculate full duration when starting from beginning', () => {
      const scriptsToPlay = mockScripts.slice(0);
      const totalDuration = calculateDuration(scriptsToPlay);
      // 500 + (800 + 400) + 300 + 500 + 200 + 500 + 200 = 3400
      expect(totalDuration).toBe(3400);
    });

    it('should calculate partial duration when starting from task-2', () => {
      const startIndex = mockScripts.findIndex(
        (item) => item.taskId === 'task-2',
      );
      const scriptsToPlay = mockScripts.slice(startIndex);
      const totalDuration = calculateDuration(scriptsToPlay);
      // 300 + 500 + 200 + 500 + 200 = 1700
      expect(totalDuration).toBe(1700);
    });

    it('should calculate partial duration when starting from task-3', () => {
      const startIndex = mockScripts.findIndex(
        (item) => item.taskId === 'task-3',
      );
      const scriptsToPlay = mockScripts.slice(startIndex);
      const totalDuration = calculateDuration(scriptsToPlay);
      // 200 + 500 + 200 = 900
      expect(totalDuration).toBe(900);
    });
  });

  describe('Initial state setup for start position', () => {
    it('should use start position screenshot for initial state', () => {
      const startFromTaskId = 'task-2';
      const foundIndex = mockScripts.findIndex(
        (item) => item.taskId === startFromTaskId,
      );
      const startScript = mockScripts[foundIndex];

      // Verify the start script has the expected image
      expect(startScript.img).toBeUndefined(); // task-2 starts with sleep (no img)

      // Find first script with image at or after startIndex
      const scriptsToPlay = mockScripts.slice(foundIndex);
      const firstImgScript = scriptsToPlay.find((s) => s.img);
      expect(firstImgScript?.img).toBe('img3');
    });

    it('should handle start position with immediate image', () => {
      const startFromTaskId = 'task-3';
      const foundIndex = mockScripts.findIndex(
        (item) => item.taskId === startFromTaskId,
      );
      const startScript = mockScripts[foundIndex];

      // task-3 starts with clear-insight (no img), next script has img
      expect(startScript.type).toBe('clear-insight');

      const scriptsToPlay = mockScripts.slice(foundIndex);
      const firstImgScript = scriptsToPlay.find((s) => s.img);
      expect(firstImgScript?.img).toBe('img4');
    });
  });
});
