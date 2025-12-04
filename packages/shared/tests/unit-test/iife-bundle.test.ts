import { describe, expect, test } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

interface GlobalWithMidscene {
  midscene_element_inspector?: {
    webExtractNodeTree: unknown;
    getNodeInfoByXpath: unknown;
    treeToList: unknown;
    traverseTree: unknown;
    trimAttributes: unknown;
    webExtractNodeTreeAsString: unknown;
    webExtractTextWithPosition: unknown;
    generateElementByPosition: unknown;
    isNotContainerElement: unknown;
    getElementXpath: unknown;
    getElementInfoByXpath: unknown;
    descriptionOfTree: unknown;
    getXpathsByPoint: unknown;
    truncateText: unknown;
    [key: string]: unknown;
  };
}

describe('IIFE bundle runtime behavior', () => {
  const bundlePath = path.join(
    __dirname,
    '../../dist-inspect/htmlElement.js',
  );

  function executeBundleInVM(): GlobalWithMidscene {
    const script = fs.readFileSync(bundlePath, 'utf-8');
    const globalObj: GlobalWithMidscene = {};
    const sandbox = {
      window: globalObj,
      globalThis: globalObj,
      document: {},
      console,
      navigator: {},
    };

    vm.runInNewContext(script, sandbox);
    return globalObj;
  }

  describe('Window global assignment', () => {
    test('should set window.midscene_element_inspector to a non-undefined value', () => {
      const globalObj = executeBundleInVM();

      expect(globalObj.midscene_element_inspector).toBeDefined();
      expect(globalObj.midscene_element_inspector).not.toBeNull();
    });

    test('should set window.midscene_element_inspector to an object with properties', () => {
      const globalObj = executeBundleInVM();

      expect(typeof globalObj.midscene_element_inspector).toBe('object');
      expect(
        globalObj.midscene_element_inspector &&
          Object.keys(globalObj.midscene_element_inspector).length,
      ).toBeGreaterThan(0);
    });
  });

  describe('Export completeness', () => {
    test('should export all required functions', () => {
      const globalObj = executeBundleInVM();
      const exports = globalObj.midscene_element_inspector;

      expect(exports).toBeDefined();

      const requiredExports = [
        'webExtractNodeTree',
        'getNodeInfoByXpath',
        'treeToList',
        'traverseTree',
        'trimAttributes',
        'webExtractNodeTreeAsString',
        'webExtractTextWithPosition',
        'generateElementByPosition',
        'isNotContainerElement',
        'getElementXpath',
        'getElementInfoByXpath',
        'descriptionOfTree',
        'getXpathsByPoint',
        'truncateText',
      ];

      for (const exportName of requiredExports) {
        expect(
          exports?.[exportName],
          `Missing export: ${exportName} - bundle may be incorrectly built`,
        ).toBeDefined();
      }
    });
  });

  describe('Bundle structure validation', () => {
    test('should not contain chunk optimization artifacts with deferred loading', () => {
      const script = fs.readFileSync(bundlePath, 'utf-8');

      // Check for webpack chunk optimization pattern that caused the bug
      // The bug manifested as __webpack_require__.O() with deferred loading
      const hasChunkOptimization =
        script.includes('__webpack_require__.O') &&
        script.includes('deferred');

      expect(
        hasChunkOptimization,
        'Bundle contains chunk optimization artifacts (__webpack_require__.O with deferred) - chunk splitting may be enabled',
      ).toBe(false);
    });

    test('should be wrapped in IIFE pattern', () => {
      const script = fs.readFileSync(bundlePath, 'utf-8');

      // Should start with IIFE opening
      const hasIIFEStart = script.trim().startsWith('(()=>{') || script.trim().startsWith('(function()');

      // Should end with IIFE closing
      const hasIIFEEnd = script.trim().endsWith('})();') || script.trim().endsWith('})()');

      expect(hasIIFEStart).toBe(true);
      expect(hasIIFEEnd).toBe(true);
    });

    test('should assign to window.midscene_element_inspector at the end of the bundle', () => {
      const script = fs.readFileSync(bundlePath, 'utf-8');

      // Should contain the window assignment
      const hasWindowAssignment = script.includes(
        'window.midscene_element_inspector',
      );

      expect(
        hasWindowAssignment,
        'Bundle does not assign to window.midscene_element_inspector',
      ).toBe(true);

      // The assignment should be near the end of the file (within last 500 chars)
      const lastChars = script.slice(-500);
      const assignmentNearEnd = lastChars.includes(
        'window.midscene_element_inspector',
      );

      expect(
        assignmentNearEnd,
        'window.midscene_element_inspector assignment should be at the end of the bundle',
      ).toBe(true);
    });
  });
});
