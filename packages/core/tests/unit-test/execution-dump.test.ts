import { describe, expect, it } from 'vitest';
import {
  ExecutionDump,
  GroupedActionDump,
  type IExecutionDump,
  type IGroupedActionDump,
} from '../../src/types';

describe('ExecutionDump', () => {
  const createMockExecutionDumpData = (): IExecutionDump => ({
    logTime: 1234567890,
    name: 'Test Execution',
    description: 'A test execution dump',
    tasks: [
      {
        type: 'Insight',
        subType: 'Locate',
        status: 'finished',
        param: { prompt: 'Find button' },
        timing: { start: 1000, end: 2000, cost: 1000 },
        executor: async () => {},
      } as any,
    ],
    aiActContext: 'Test context',
  });

  describe('constructor', () => {
    it('should create an ExecutionDump instance from IExecutionDump data', () => {
      const data = createMockExecutionDumpData();
      const dump = new ExecutionDump(data);

      expect(dump.logTime).toBe(data.logTime);
      expect(dump.name).toBe(data.name);
      expect(dump.description).toBe(data.description);
      expect(dump.tasks).toEqual(data.tasks);
      expect(dump.aiActContext).toBe(data.aiActContext);
    });

    it('should handle optional fields', () => {
      const data: IExecutionDump = {
        logTime: 1234567890,
        name: 'Minimal Execution',
        tasks: [],
      };
      const dump = new ExecutionDump(data);

      expect(dump.logTime).toBe(1234567890);
      expect(dump.name).toBe('Minimal Execution');
      expect(dump.description).toBeUndefined();
      expect(dump.tasks).toEqual([]);
      expect(dump.aiActContext).toBeUndefined();
    });
  });

  describe('serialize', () => {
    it('should serialize to JSON string', () => {
      const data = createMockExecutionDumpData();
      const dump = new ExecutionDump(data);
      const serialized = dump.serialize();

      expect(typeof serialized).toBe('string');
      const parsed = JSON.parse(serialized);
      expect(parsed.logTime).toBe(data.logTime);
      expect(parsed.name).toBe(data.name);
      expect(parsed.description).toBe(data.description);
    });

    it('should serialize with indentation when specified', () => {
      const data = createMockExecutionDumpData();
      const dump = new ExecutionDump(data);
      const serialized = dump.serialize(2);

      expect(serialized).toContain('\n');
      expect(serialized).toContain('  ');
    });

    it('should handle Page and Browser objects in serialization', () => {
      const data = createMockExecutionDumpData();
      // Simulate a task with Page object
      data.tasks = [
        {
          type: 'Action',
          status: 'finished',
          param: {
            page: { constructor: { name: 'Page' } },
            browser: { constructor: { name: 'Browser' } },
          },
          executor: async () => {},
        } as any,
      ];

      const dump = new ExecutionDump(data);
      const serialized = dump.serialize();

      expect(serialized).toContain('[Page object]');
      expect(serialized).toContain('[Browser object]');
    });
  });

  describe('toJSON', () => {
    it('should return a plain object', () => {
      const data = createMockExecutionDumpData();
      const dump = new ExecutionDump(data);
      const json = dump.toJSON();

      expect(json).toEqual({
        logTime: data.logTime,
        name: data.name,
        description: data.description,
        tasks: data.tasks,
        aiActContext: data.aiActContext,
      });
    });
  });

  describe('fromSerializedString', () => {
    it('should create an ExecutionDump from serialized string', () => {
      const data = createMockExecutionDumpData();
      const serialized = JSON.stringify(data);
      const dump = ExecutionDump.fromSerializedString(serialized);

      expect(dump).toBeInstanceOf(ExecutionDump);
      expect(dump.logTime).toBe(data.logTime);
      expect(dump.name).toBe(data.name);
      expect(dump.description).toBe(data.description);
    });

    it('should throw on invalid JSON', () => {
      expect(() =>
        ExecutionDump.fromSerializedString('invalid json'),
      ).toThrow();
    });
  });

  describe('fromJSON', () => {
    it('should create an ExecutionDump from plain object', () => {
      const data = createMockExecutionDumpData();
      const dump = ExecutionDump.fromJSON(data);

      expect(dump).toBeInstanceOf(ExecutionDump);
      expect(dump.logTime).toBe(data.logTime);
      expect(dump.name).toBe(data.name);
    });
  });

  describe('round-trip serialization', () => {
    it('should preserve data through serialize/fromSerializedString cycle', () => {
      const originalData = createMockExecutionDumpData();
      const dump1 = new ExecutionDump(originalData);
      const serialized = dump1.serialize();
      const dump2 = ExecutionDump.fromSerializedString(serialized);

      expect(dump2.logTime).toBe(dump1.logTime);
      expect(dump2.name).toBe(dump1.name);
      expect(dump2.description).toBe(dump1.description);
      expect(dump2.aiActContext).toBe(dump1.aiActContext);
    });
  });
});

describe('GroupedActionDump', () => {
  const createMockGroupedActionDumpData = (): IGroupedActionDump => ({
    sdkVersion: '1.0.0',
    groupName: 'Test Group',
    groupDescription: 'A test group description',
    modelBriefs: ['model1', 'model2'],
    executions: [
      {
        logTime: 1234567890,
        name: 'Execution 1',
        description: 'First execution',
        tasks: [],
      },
      {
        logTime: 1234567891,
        name: 'Execution 2',
        tasks: [],
      },
    ],
  });

  describe('constructor', () => {
    it('should create a GroupedActionDump instance from IGroupedActionDump data', () => {
      const data = createMockGroupedActionDumpData();
      const dump = new GroupedActionDump(data);

      expect(dump.sdkVersion).toBe(data.sdkVersion);
      expect(dump.groupName).toBe(data.groupName);
      expect(dump.groupDescription).toBe(data.groupDescription);
      expect(dump.modelBriefs).toEqual(data.modelBriefs);
      expect(dump.executions).toHaveLength(2);
    });

    it('should convert IExecutionDump to ExecutionDump instances', () => {
      const data = createMockGroupedActionDumpData();
      const dump = new GroupedActionDump(data);

      dump.executions.forEach((execution) => {
        expect(execution).toBeInstanceOf(ExecutionDump);
      });
    });

    it('should preserve existing ExecutionDump instances', () => {
      const executionDump = new ExecutionDump({
        logTime: 1234567890,
        name: 'Existing Execution',
        tasks: [],
      });

      const data: IGroupedActionDump = {
        sdkVersion: '1.0.0',
        groupName: 'Test',
        modelBriefs: [],
        executions: [executionDump],
      };

      const dump = new GroupedActionDump(data);
      expect(dump.executions[0]).toBe(executionDump);
    });

    it('should handle optional fields', () => {
      const data: IGroupedActionDump = {
        sdkVersion: '1.0.0',
        groupName: 'Minimal Group',
        modelBriefs: [],
        executions: [],
      };
      const dump = new GroupedActionDump(data);

      expect(dump.sdkVersion).toBe('1.0.0');
      expect(dump.groupName).toBe('Minimal Group');
      expect(dump.groupDescription).toBeUndefined();
      expect(dump.modelBriefs).toEqual([]);
      expect(dump.executions).toEqual([]);
    });
  });

  describe('serialize', () => {
    it('should serialize to JSON string', () => {
      const data = createMockGroupedActionDumpData();
      const dump = new GroupedActionDump(data);
      const serialized = dump.serialize();

      expect(typeof serialized).toBe('string');
      const parsed = JSON.parse(serialized);
      expect(parsed.sdkVersion).toBe(data.sdkVersion);
      expect(parsed.groupName).toBe(data.groupName);
      expect(parsed.executions).toHaveLength(2);
    });

    it('should serialize with indentation when specified', () => {
      const data = createMockGroupedActionDumpData();
      const dump = new GroupedActionDump(data);
      const serialized = dump.serialize(2);

      expect(serialized).toContain('\n');
      expect(serialized).toContain('  ');
    });

    it('should serialize nested ExecutionDump instances correctly', () => {
      const data = createMockGroupedActionDumpData();
      const dump = new GroupedActionDump(data);
      const serialized = dump.serialize();
      const parsed = JSON.parse(serialized);

      expect(parsed.executions[0].logTime).toBe(1234567890);
      expect(parsed.executions[0].name).toBe('Execution 1');
      expect(parsed.executions[1].name).toBe('Execution 2');
    });
  });

  describe('toJSON', () => {
    it('should return a plain object with nested toJSON calls', () => {
      const data = createMockGroupedActionDumpData();
      const dump = new GroupedActionDump(data);
      const json = dump.toJSON();

      expect(json.sdkVersion).toBe(data.sdkVersion);
      expect(json.groupName).toBe(data.groupName);
      expect(json.executions).toHaveLength(2);
      // Verify nested objects are plain objects, not class instances
      expect(json.executions[0]).not.toBeInstanceOf(ExecutionDump);
    });
  });

  describe('fromSerializedString', () => {
    it('should create a GroupedActionDump from serialized string', () => {
      const data = createMockGroupedActionDumpData();
      const serialized = JSON.stringify(data);
      const dump = GroupedActionDump.fromSerializedString(serialized);

      expect(dump).toBeInstanceOf(GroupedActionDump);
      expect(dump.sdkVersion).toBe(data.sdkVersion);
      expect(dump.groupName).toBe(data.groupName);
      expect(dump.executions).toHaveLength(2);
    });

    it('should convert nested executions to ExecutionDump instances', () => {
      const data = createMockGroupedActionDumpData();
      const serialized = JSON.stringify(data);
      const dump = GroupedActionDump.fromSerializedString(serialized);

      dump.executions.forEach((execution) => {
        expect(execution).toBeInstanceOf(ExecutionDump);
      });
    });

    it('should throw on invalid JSON', () => {
      expect(() =>
        GroupedActionDump.fromSerializedString('invalid json'),
      ).toThrow();
    });
  });

  describe('fromJSON', () => {
    it('should create a GroupedActionDump from plain object', () => {
      const data = createMockGroupedActionDumpData();
      const dump = GroupedActionDump.fromJSON(data);

      expect(dump).toBeInstanceOf(GroupedActionDump);
      expect(dump.sdkVersion).toBe(data.sdkVersion);
      expect(dump.groupName).toBe(data.groupName);
    });
  });

  describe('round-trip serialization', () => {
    it('should preserve data through serialize/fromSerializedString cycle', () => {
      const originalData = createMockGroupedActionDumpData();
      const dump1 = new GroupedActionDump(originalData);
      const serialized = dump1.serialize();
      const dump2 = GroupedActionDump.fromSerializedString(serialized);

      expect(dump2.sdkVersion).toBe(dump1.sdkVersion);
      expect(dump2.groupName).toBe(dump1.groupName);
      expect(dump2.groupDescription).toBe(dump1.groupDescription);
      expect(dump2.modelBriefs).toEqual(dump1.modelBriefs);
      expect(dump2.executions.length).toBe(dump1.executions.length);

      for (let i = 0; i < dump2.executions.length; i++) {
        expect(dump2.executions[i].name).toBe(dump1.executions[i].name);
        expect(dump2.executions[i].logTime).toBe(dump1.executions[i].logTime);
      }
    });

    it('should handle complex nested structures', () => {
      const complexData: IGroupedActionDump = {
        sdkVersion: '2.0.0',
        groupName: 'Complex Group',
        groupDescription: 'A complex test',
        modelBriefs: ['openai/gpt-4', 'anthropic/claude'],
        executions: [
          {
            logTime: Date.now(),
            name: 'Complex Execution',
            description: 'With many tasks',
            tasks: [
              {
                type: 'Insight',
                subType: 'Locate',
                status: 'finished',
                param: { prompt: 'Find element' },
                output: { element: { center: [100, 200] } },
                timing: { start: 0, end: 100, cost: 100 },
                executor: async () => {},
              } as any,
              {
                type: 'Action',
                subType: 'Click',
                status: 'finished',
                timing: { start: 100, end: 200, cost: 100 },
                executor: async () => {},
              } as any,
            ],
            aiActContext: 'Test AI context',
          },
        ],
      };

      const dump1 = new GroupedActionDump(complexData);
      const serialized = dump1.serialize();
      const dump2 = GroupedActionDump.fromSerializedString(serialized);

      expect(dump2.executions[0].tasks).toHaveLength(2);
      expect(dump2.executions[0].aiActContext).toBe('Test AI context');
    });
  });
});

describe('ExecutionDump and GroupedActionDump integration', () => {
  it('should work together in a typical workflow', () => {
    // Create ExecutionDump instances
    const execution1 = new ExecutionDump({
      logTime: Date.now(),
      name: 'First Action',
      tasks: [],
    });

    const execution2 = new ExecutionDump({
      logTime: Date.now() + 1000,
      name: 'Second Action',
      tasks: [],
    });

    // Create GroupedActionDump with ExecutionDump instances
    const groupedDump = new GroupedActionDump({
      sdkVersion: '1.0.0',
      groupName: 'Integration Test',
      modelBriefs: [],
      executions: [execution1, execution2],
    });

    // Serialize the entire structure
    const serialized = groupedDump.serialize();

    // Deserialize and verify
    const restored = GroupedActionDump.fromSerializedString(serialized);

    expect(restored.executions).toHaveLength(2);
    expect(restored.executions[0].name).toBe('First Action');
    expect(restored.executions[1].name).toBe('Second Action');
  });
});
