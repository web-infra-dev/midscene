import { transformFeatureFileToRstestModule } from '@/framework/feature-loader';
import { describe, expect, test } from 'vitest';

describe('feature file loader', () => {
  test('emits one Rstest case per scenario using precomputed result files', () => {
    const source = [
      'Feature: Checkout',
      'Scenario: Add item',
      '  Given I open the product page',
      '  Then the cart shows one item',
      '',
      'Scenario: Remove item',
      '  Given the cart has one item',
      '  Then the cart is empty',
      '',
    ].join('\n');

    const output = transformFeatureFileToRstestModule({
      source,
      featureFile: '/repo/features/checkout.feature',
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
    const source = [
      'Feature: Checkout',
      'Scenario: Retry checkout',
      '  Given I open checkout',
      '  Then checkout is visible',
      '',
      'Scenario: Retry checkout',
      '  Given I refresh checkout',
      '  Then checkout is still visible',
      '',
    ].join('\n');

    const output = transformFeatureFileToRstestModule({
      source,
      featureFile: '/repo/features/checkout.feature',
      frameworkImport: '/repo/packages/cli/dist/lib/framework/index.js',
      rstestCoreImport: '/repo/node_modules/@rstest/core/dist/index.js',
      cases: [
        {
          caseId: '2',
          testName: 'features/checkout.feature > Checkout > Retry checkout #1',
          resultFile: '/tmp/results/001-retry-checkout.json',
        },
        {
          caseId: '5',
          testName: 'features/checkout.feature > Checkout > Retry checkout #2',
          resultFile: '/tmp/results/002-retry-checkout.json',
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

  test('throws when loader metadata count or case id does not match parsed cases', () => {
    const source = [
      'Feature: Checkout',
      'Scenario: Add item',
      '  Then the cart shows one item',
      '',
    ].join('\n');

    expect(() =>
      transformFeatureFileToRstestModule({
        source,
        featureFile: '/repo/features/checkout.feature',
        frameworkImport: '/repo/packages/cli/dist/lib/framework/index.js',
        rstestCoreImport: '/repo/node_modules/@rstest/core/dist/index.js',
        cases: [
          {
            caseId: '1',
            testName: 'features/checkout.feature > Checkout > Add item',
            resultFile: '/tmp/results/001-add-item.json',
          },
          {
            caseId: 'extra',
            testName: 'features/checkout.feature > Checkout > Extra',
            resultFile: '/tmp/results/002-extra.json',
          },
        ],
      }),
    ).toThrow(
      '/repo/features/checkout.feature: Loader metadata count 2 does not match parsed case count 1',
    );

    expect(() =>
      transformFeatureFileToRstestModule({
        source,
        featureFile: '/repo/features/checkout.feature',
        frameworkImport: '/repo/packages/cli/dist/lib/framework/index.js',
        rstestCoreImport: '/repo/node_modules/@rstest/core/dist/index.js',
        cases: [
          {
            caseId: 'wrong',
            testName: 'features/checkout.feature > Checkout > Add item',
            resultFile: '/tmp/results/001-add-item.json',
          },
        ],
      }),
    ).toThrow(
      '/repo/features/checkout.feature: Loader metadata for case "wrong" does not match parsed case "1" at index 0',
    );
  });
});
