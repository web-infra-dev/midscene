import { describe, expect, it } from 'vitest';
import { ExecutionDump, GroupedActionDump } from '../../src/dump';
import { ScreenshotItem } from '../../src/screenshot-item';
import { MemoryStorage } from '../../src/storage';

describe('dump serialization round-trip', () => {
  it('should preserve screenshot IDs through serialize/deserialize cycle', async () => {
    const storage = new MemoryStorage();

    // Create a screenshot
    const screenshot = await ScreenshotItem.create(
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      storage,
    );
    const originalId = screenshot.id;

    // Create execution dump with the screenshot
    const dump = new GroupedActionDump('test-group', {
      storageProvider: storage,
    });
    const execution = new ExecutionDump({
      name: 'test-execution',
      tasks: [
        {
          type: 'Insight',
          status: 'finished',
          recorder: [
            {
              type: 'screenshot',
              ts: Date.now(),
              screenshot,
            },
          ],
        } as any,
      ],
    });
    dump.appendExecution(execution);

    // Serialize
    const { json, images } = await dump.serializeWithImages();

    // Verify the image map contains the original ID
    expect(images.has(originalId)).toBe(true);

    // Deserialize
    const restored = await GroupedActionDump.fromJSONWithImages(
      json,
      Object.fromEntries(images),
    );

    // Verify the restored dump has proper structure
    expect(restored.executions.length).toBe(1);
    const restoredExecution = restored.executions[0];
    expect(restoredExecution.tasks.length).toBe(1);

    const restoredTask = restoredExecution.tasks[0];
    expect(restoredTask.recorder).toBeDefined();
    expect(restoredTask.recorder?.length).toBe(1);

    const restoredScreenshot = restoredTask.recorder?.[0]?.screenshot;
    expect(restoredScreenshot).toBeDefined();

    // Verify the screenshot is a ScreenshotItem instance
    expect(restoredScreenshot).toBeInstanceOf(ScreenshotItem);

    // Verify the ID is preserved
    expect((restoredScreenshot as ScreenshotItem).id).toBe(originalId);

    // Verify getData works
    const data = await (restoredScreenshot as ScreenshotItem).getData();
    expect(data).toContain('iVBORw0KGgo');
  });

  it('should handle HTML round-trip with separate image scripts', async () => {
    const storage = new MemoryStorage();

    // Create a screenshot
    const screenshot = await ScreenshotItem.create(
      'data:image/png;base64,TEST_BASE64_DATA',
      storage,
    );

    // Create dump
    const dump = new GroupedActionDump('html-test', {
      storageProvider: storage,
    });
    const execution = new ExecutionDump({
      name: 'html-execution',
      tasks: [
        {
          type: 'Log',
          status: 'finished',
          recorder: [
            {
              type: 'screenshot',
              ts: 12345,
              screenshot,
            },
          ],
        } as any,
      ],
    });
    dump.appendExecution(execution);

    // Generate HTML
    const html = await dump.toHTML();

    // Verify HTML contains image script tags
    expect(html).toContain('type="midscene-image"');
    expect(html).toContain('data-id=');
    expect(html).toContain('TEST_BASE64_DATA');

    // Restore from HTML
    const restored = await GroupedActionDump.fromHTML(html);

    // Verify restored structure
    expect(restored.executions.length).toBe(1);
    const task = restored.executions[0].tasks[0];
    expect(task.recorder?.[0]?.screenshot).toBeInstanceOf(ScreenshotItem);
  });

  it('should preserve multiple screenshots with distinct IDs', async () => {
    const storage = new MemoryStorage();

    // Create multiple screenshots
    const screenshot1 = await ScreenshotItem.create(
      'data:image/png;base64,IMG1',
      storage,
    );
    const screenshot2 = await ScreenshotItem.create(
      'data:image/png;base64,IMG2',
      storage,
    );

    expect(screenshot1.id).not.toBe(screenshot2.id);

    const dump = new GroupedActionDump('multi-screenshot', {
      storageProvider: storage,
    });
    const execution = new ExecutionDump({
      name: 'multi-exec',
      tasks: [
        {
          type: 'Insight',
          status: 'finished',
          recorder: [
            { type: 'screenshot', ts: 1, screenshot: screenshot1 },
            { type: 'screenshot', ts: 2, screenshot: screenshot2 },
          ],
        } as any,
      ],
    });
    dump.appendExecution(execution);

    // Serialize and deserialize
    const { json, images } = await dump.serializeWithImages();
    expect(images.size).toBe(2);

    const restored = await GroupedActionDump.fromJSONWithImages(
      json,
      Object.fromEntries(images),
    );

    const recorder = restored.executions[0].tasks[0].recorder;
    expect(recorder?.length).toBe(2);

    const s1 = recorder?.[0]?.screenshot as ScreenshotItem;
    const s2 = recorder?.[1]?.screenshot as ScreenshotItem;

    expect(s1.id).toBe(screenshot1.id);
    expect(s2.id).toBe(screenshot2.id);

    expect(await s1.getData()).toBe('data:image/png;base64,IMG1');
    expect(await s2.getData()).toBe('data:image/png;base64,IMG2');
  });

  it('should handle legacy inline base64 format via fromHTML', async () => {
    // Simulate legacy HTML format with inline base64 in the dump
    const legacyHtml = `
      <script type="midscene_web_dump">
        {
          "sdkVersion": "1.0.0",
          "groupName": "legacy-test",
          "modelBriefs": [],
          "executions": [{
            "logTime": 12345,
            "name": "legacy-exec",
            "tasks": [{
              "type": "Insight",
              "status": "finished",
              "recorder": [{
                "type": "screenshot",
                "ts": 100,
                "screenshot": "data:image/png;base64,LEGACY_BASE64_DATA"
              }]
            }]
          }]
        }
      </script>
    `;

    // fromHTML should detect legacy format and convert
    const restored = await GroupedActionDump.fromHTML(legacyHtml);

    expect(restored.executions.length).toBe(1);
    const task = restored.executions[0].tasks[0];
    expect(task.recorder?.length).toBe(1);

    const screenshot = task.recorder?.[0]?.screenshot;
    expect(screenshot).toBeInstanceOf(ScreenshotItem);

    // Verify getData returns the original base64
    const data = await (screenshot as ScreenshotItem).getData();
    expect(data).toBe('data:image/png;base64,LEGACY_BASE64_DATA');
  });

  it('should allow re-serializing a restored legacy dump', async () => {
    // Legacy format with inline base64
    const legacyHtml = `
      <script type="midscene_web_dump">
        {
          "sdkVersion": "1.0.0",
          "groupName": "resave-test",
          "modelBriefs": [],
          "executions": [{
            "logTime": 999,
            "name": "resave-exec",
            "tasks": [{
              "type": "Log",
              "status": "finished",
              "recorder": [{
                "type": "screenshot",
                "ts": 50,
                "screenshot": "data:image/png;base64,RESAVE_DATA"
              }]
            }]
          }]
        }
      </script>
    `;

    // Restore from legacy format
    const restored = await GroupedActionDump.fromHTML(legacyHtml);

    // Re-serialize to new format
    const { json, images } = await restored.serializeWithImages();

    // Should have extracted the image
    expect(images.size).toBe(1);
    const imageData = Array.from(images.values())[0];
    expect(imageData).toBe('data:image/png;base64,RESAVE_DATA');

    // JSON should contain $screenshot reference
    expect(json).toContain('$screenshot');
    expect(json).not.toContain('RESAVE_DATA');

    // Restore again and verify
    const reRestored = await GroupedActionDump.fromJSONWithImages(
      json,
      Object.fromEntries(images),
    );

    const screenshot = reRestored.executions[0].tasks[0].recorder?.[0]
      ?.screenshot as ScreenshotItem;
    expect(await screenshot.getData()).toBe(
      'data:image/png;base64,RESAVE_DATA',
    );
  });

  it('should preserve logTime through serialization round-trip', async () => {
    const storage = new MemoryStorage();
    const originalLogTime = 1609459200000; // 2021-01-01

    const dump = new GroupedActionDump('logtime-test', {
      storageProvider: storage,
    });
    const execution = new ExecutionDump({
      name: 'logtime-exec',
      logTime: originalLogTime,
      tasks: [],
    });
    dump.appendExecution(execution);

    // Verify logTime was set
    expect(execution.logTime).toBe(originalLogTime);

    // Serialize
    const json = dump.serialize();

    // Deserialize
    const restored = GroupedActionDump.fromJSON(json);

    // Verify logTime is preserved
    expect(restored.executions[0].logTime).toBe(originalLogTime);
  });

  it('should preserve sdkVersion through serialization round-trip', async () => {
    const storage = new MemoryStorage();
    const originalVersion = '0.9.0';

    const dump = new GroupedActionDump('version-test', {
      storageProvider: storage,
      sdkVersion: originalVersion,
    });

    // Verify sdkVersion was set
    expect(dump.sdkVersion).toBe(originalVersion);

    // Serialize
    const json = dump.serialize();

    // Deserialize
    const restored = GroupedActionDump.fromJSON(json);

    // Verify sdkVersion is preserved
    expect(restored.sdkVersion).toBe(originalVersion);
  });

  it('should preserve metadata through HTML round-trip', async () => {
    const storage = new MemoryStorage();
    const originalLogTime = 1609459200000;
    const originalVersion = '0.8.5';

    const dump = new GroupedActionDump('metadata-test', {
      storageProvider: storage,
      sdkVersion: originalVersion,
    });
    const execution = new ExecutionDump({
      name: 'meta-exec',
      logTime: originalLogTime,
      tasks: [],
    });
    dump.appendExecution(execution);

    // Generate HTML
    const html = await dump.toHTML();

    // Restore from HTML
    const restored = await GroupedActionDump.fromHTML(html);

    // Verify metadata is preserved
    expect(restored.sdkVersion).toBe(originalVersion);
    expect(restored.executions[0].logTime).toBe(originalLogTime);
  });
});
