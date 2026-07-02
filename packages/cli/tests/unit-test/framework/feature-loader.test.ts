import featureLoader, {
  transformFeatureFileToRstestModule,
} from '@/framework/feature-loader';
import { describe, expect, test } from 'vitest';

describe('feature file loader', () => {
  test('emits one Rstest case per scenario using precomputed result files', () => {
    const output = transformFeatureFileToRstestModule({
      frameworkImport: '/repo/packages/cli/dist/lib/framework/index.js',
      rstestCoreImport: '/repo/node_modules/@rstest/core/dist/index.js',
      cases: [
        {
          caseId: '2',
          testName: 'features/checkout.feature > Checkout > Add item',
          resultFile: '/tmp/results/001-add-item.json',
          caseOptions: {
            globalConfig: {
              web: {
                url: 'https://shop.example',
              },
            },
            executionConfig: {
              tasks: [
                {
                  name: 'Add item',
                  flow: [
                    { aiAct: 'I open the product page' },
                    { aiAssert: 'the cart shows one item' },
                  ],
                },
              ],
            },
          },
          webRuntimeOptions: {
            headed: true,
          },
        },
        {
          caseId: '5',
          testName: 'features/checkout.feature > Checkout > Remove item',
          resultFile: '/tmp/results/002-remove-item.json',
          caseOptions: {
            globalConfig: {
              web: {
                url: 'https://shop.example',
              },
            },
            executionConfig: {
              tasks: [
                {
                  name: 'Remove item',
                  flow: [
                    { aiAct: 'the cart has one item' },
                    { aiAssert: 'the cart is empty' },
                  ],
                },
              ],
            },
          },
          webRuntimeOptions: {
            headed: true,
          },
        },
      ],
    });

    expect(output).toContain('import { test } from');
    expect(output).toContain('defineYamlCaseTest(test');
    expect(output).toContain(
      '"testName": "features/checkout.feature > Checkout > Add item"',
    );
    expect(output).toContain('"resultFile": "/tmp/results/001-add-item.json"');
    expect(output).toContain('"aiAct": "I open the product page"');
    expect(output).toContain('"aiAssert": "the cart shows one item"');
    expect(output).toContain(
      '"testName": "features/checkout.feature > Checkout > Remove item"',
    );
    expect(output).toContain(
      '"resultFile": "/tmp/results/002-remove-item.json"',
    );
  });

  test('keeps duplicate scenario names mapped to distinct result files by order', () => {
    const output = transformFeatureFileToRstestModule({
      frameworkImport: '/repo/packages/cli/dist/lib/framework/index.js',
      rstestCoreImport: '/repo/node_modules/@rstest/core/dist/index.js',
      cases: [
        {
          caseId: '2',
          testName: 'features/checkout.feature > Checkout > Retry checkout #1',
          resultFile: '/tmp/results/001-retry-checkout.json',
          caseOptions: {
            executionConfig: {
              tasks: [
                {
                  name: 'Retry checkout #1',
                  flow: [{ aiAct: 'I open checkout' }],
                },
              ],
            },
          },
        },
        {
          caseId: '5',
          testName: 'features/checkout.feature > Checkout > Retry checkout #2',
          resultFile: '/tmp/results/002-retry-checkout.json',
          caseOptions: {
            executionConfig: {
              tasks: [
                {
                  name: 'Retry checkout #2',
                  flow: [{ aiAct: 'I refresh checkout' }],
                },
              ],
            },
          },
        },
      ],
    });

    expect(output).toContain(
      '"resultFile": "/tmp/results/001-retry-checkout.json"',
    );
    expect(output).toContain('"aiAct": "I open checkout"');
    expect(output).toContain(
      '"resultFile": "/tmp/results/002-retry-checkout.json"',
    );
    expect(output).toContain('"aiAct": "I refresh checkout"');
  });

  test('throws when Rspack loader metadata is missing for the feature file', () => {
    expect(() =>
      featureLoader.call(
        {
          resourcePath: '/repo/features/missing.feature',
          getOptions: () => ({
            frameworkImport: '/repo/packages/cli/dist/lib/framework/index.js',
            rstestCoreImport: '/repo/node_modules/@rstest/core/dist/index.js',
            featureCasesByFile: {},
          }),
        },
        '',
      ),
    ).toThrow(
      '/repo/features/missing.feature: Missing feature loader metadata',
    );
  });
});
