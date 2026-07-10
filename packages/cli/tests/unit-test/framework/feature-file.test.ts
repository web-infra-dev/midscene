import { compileFeatureFile } from '@/framework/feature-file';
import { describe, expect, test } from 'vitest';

describe('feature-file parser', () => {
  test('compiles scenarios into Midscene aiAct and aiAssert tasks', () => {
    const compiled = compileFeatureFile(
      [
        'Feature: Login',
        'Scenario: Failed login',
        '  Given I open the login page',
        '  And I type a bad password',
        '  Then an error is shown',
        '  But the user stays signed out',
        '',
      ].join('\n'),
      '/repo/features/login.feature',
    );

    expect(compiled).toEqual([
      {
        scenarioName: 'Failed login',
        testName: 'Login > Failed login',
        executionConfig: {
          tasks: [
            {
              name: 'Failed login',
              flow: [
                { aiAct: 'I open the login page' },
                { aiAct: 'I type a bad password' },
                { aiAssert: 'an error is shown' },
                { aiAssert: 'the user stays signed out' },
              ],
            },
          ],
        },
      },
    ]);
  });

  test('compiles feature and rule backgrounds into each scenario', () => {
    const compiled = compileFeatureFile(
      [
        'Feature: Checkout',
        '  Background:',
        '    Given I am signed in',
        '',
        '  Rule: Cart management',
        '    Background:',
        '      Given the cart is empty',
        '',
        '    Scenario: Add item',
        '      When I add a hat',
        '      Then the cart has 1 item',
        '',
      ].join('\n'),
      '/repo/features/checkout.feature',
    );

    expect(compiled).toEqual([
      {
        scenarioName: 'Add item',
        testName: 'Checkout > Cart management > Add item',
        executionConfig: {
          tasks: [
            {
              name: 'Add item',
              flow: [
                { aiAct: 'I am signed in' },
                { aiAct: 'the cart is empty' },
                { aiAct: 'I add a hat' },
                { aiAssert: 'the cart has 1 item' },
              ],
            },
          ],
        },
      },
    ]);
  });

  test('compiles scenario outlines into one scenario per example row', () => {
    const compiled = compileFeatureFile(
      [
        'Feature: Checkout',
        'Scenario Outline: Add quantities',
        '  When I add <qty> <item>',
        '  Then the cart has <qty> item',
        '',
        '  Examples:',
        '    | qty | item  |',
        '    | 2   | hats  |',
        '    | 3   | shoes |',
        '',
      ].join('\n'),
      '/repo/features/checkout.feature',
    );

    expect(compiled.map((item) => item.testName)).toEqual([
      'Checkout > Add quantities #1',
      'Checkout > Add quantities #2',
    ]);
    expect(compiled.map((item) => item.executionConfig.tasks[0].flow)).toEqual([
      [{ aiAct: 'I add 2 hats' }, { aiAssert: 'the cart has 2 item' }],
      [{ aiAct: 'I add 3 shoes' }, { aiAssert: 'the cart has 3 item' }],
    ]);
  });

  test('compiles multiple examples blocks and placeholders in scenario names', () => {
    const compiled = compileFeatureFile(
      [
        'Feature: Checkout',
        'Scenario Outline: Add <qty> <item>',
        '  Then the cart has <qty> <item>',
        '',
        '  Examples: Hats',
        '    | qty | item |',
        '    | 2   | hats |',
        '',
        '  Examples: Shoes',
        '    | qty | item  |',
        '    | 3   | shoes |',
        '',
      ].join('\n'),
      '/repo/features/checkout.feature',
    );

    expect(compiled.map((item) => item.testName)).toEqual([
      'Checkout > Add 2 hats',
      'Checkout > Add 3 shoes',
    ]);
    expect(compiled.map((item) => item.executionConfig.tasks[0].flow)).toEqual([
      [{ aiAssert: 'the cart has 2 hats' }],
      [{ aiAssert: 'the cart has 3 shoes' }],
    ]);
  });

  test('lets And inherit from background steps but rejects leading And', () => {
    const compiled = compileFeatureFile(
      [
        'Feature: Checkout',
        'Background:',
        '  Given I am signed in',
        'Scenario: Continue from background',
        '  And I open the cart',
        '  Then the cart is visible',
        '',
      ].join('\n'),
      '/repo/features/checkout.feature',
    );

    expect(compiled[0].executionConfig.tasks[0].flow).toEqual([
      { aiAct: 'I am signed in' },
      { aiAct: 'I open the cart' },
      { aiAssert: 'the cart is visible' },
    ]);

    expect(() =>
      compileFeatureFile(
        [
          'Feature: Checkout',
          'Scenario: Bad start',
          '  And I open the cart',
          '',
        ].join('\n'),
        '/repo/features/checkout.feature',
      ),
    ).toThrow('Unsupported Gherkin step type: Unknown');
  });

  test('does not suffix same scenario names under different rules', () => {
    const compiled = compileFeatureFile(
      [
        'Feature: Checkout',
        'Rule: Buyer cart',
        '  Scenario: Review cart',
        '    Then the buyer cart is visible',
        'Rule: Admin cart',
        '  Scenario: Review cart',
        '    Then the admin cart is visible',
        '',
      ].join('\n'),
      '/repo/features/checkout.feature',
    );

    expect(compiled.map((item) => item.testName)).toEqual([
      'Checkout > Buyer cart > Review cart',
      'Checkout > Admin cart > Review cart',
    ]);
  });

  test('throws for scenario outlines without example rows', () => {
    expect(() =>
      compileFeatureFile(
        [
          'Feature: Checkout',
          'Scenario Outline: Add quantities',
          '  When I add <qty> items',
          '  Then the cart has <qty> items',
          '',
          '  Examples:',
          '    | qty |',
          '',
        ].join('\n'),
        '/repo/features/checkout.feature',
      ),
    ).toThrow(
      '/repo/features/checkout.feature:2: Scenario Outline requires at least one Examples row',
    );
  });

  test('throws for unsupported feature and scenario descriptions', () => {
    expect(() =>
      compileFeatureFile(
        [
          'Feature: Checkout',
          '  Extra prose is not supported',
          'Scenario: Add item',
          '  Given I open the page',
          '',
        ].join('\n'),
        '/repo/features/checkout.feature',
      ),
    ).toThrow(
      '/repo/features/checkout.feature:1: Feature descriptions are not supported by the Midscene feature runner',
    );

    expect(() =>
      compileFeatureFile(
        [
          'Feature: Checkout',
          'Scenario: Add item',
          '  Extra scenario prose is not supported',
          '  Given I open the page',
          '',
        ].join('\n'),
        '/repo/features/checkout.feature',
      ),
    ).toThrow(
      '/repo/features/checkout.feature:2: Scenario descriptions are not supported by the Midscene feature runner',
    );
  });
});
