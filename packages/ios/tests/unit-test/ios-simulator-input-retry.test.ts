import { describe, expect, it, rs } from '@rstest/core';
import {
  IOSSimulatorInputValueError,
  inputUntilObserved,
  readIOSSimulatorInputValue,
} from '../ios-simulator-input-retry';

const EXPECTED_VALUE = 'Midscene iOS input 2026';

describe('readIOSSimulatorInputValue', () => {
  it('returns the value of the matching text field', () => {
    expect(
      readIOSSimulatorInputValue(
        `<XCUIElementTypeTextField name="Other Input" value="other" />
<XCUIElementTypeTextField name="Midscene Smoke Input" value="${EXPECTED_VALUE}" />`,
        'Midscene Smoke Input',
      ),
    ).toBe(EXPECTED_VALUE);
  });

  it('returns undefined when the matching text field has no value', () => {
    expect(
      readIOSSimulatorInputValue(
        '<XCUIElementTypeTextField name="Midscene Smoke Input" />',
        'Midscene Smoke Input',
      ),
    ).toBeUndefined();
  });

  it('fails when the matching text field is missing', () => {
    expect(() =>
      readIOSSimulatorInputValue(
        '<XCUIElementTypeTextField name="Other Input" value="other" />',
        'Midscene Smoke Input',
      ),
    ).toThrow(
      'iOS Simulator input "Midscene Smoke Input" is missing from WDA source',
    );
  });
});

describe('iOS Simulator input retry', () => {
  it('returns the first observed value without retrying', async () => {
    const performInput = rs.fn(async () => undefined);
    const readValue = rs.fn(async () => EXPECTED_VALUE);
    const onRetry = rs.fn();

    await expect(
      inputUntilObserved({
        expectedValue: EXPECTED_VALUE,
        performInput,
        readValue,
        retryIntervalMs: 0,
        onRetry,
      }),
    ).resolves.toEqual({
      value: EXPECTED_VALUE,
      attempts: 1,
    });
    expect(performInput).toHaveBeenCalledWith(1);
    expect(readValue).toHaveBeenCalledWith(1);
    expect(onRetry).not.toHaveBeenCalled();
  });

  it('retries only after observing an unexpected input value', async () => {
    const observedValues = [undefined, EXPECTED_VALUE];
    const performInput = rs.fn(async () => undefined);
    const readValue = rs.fn(async () => observedValues.shift());
    const onRetry = rs.fn();

    await expect(
      inputUntilObserved({
        expectedValue: EXPECTED_VALUE,
        performInput,
        readValue,
        retryIntervalMs: 0,
        onRetry,
      }),
    ).resolves.toEqual({
      value: EXPECTED_VALUE,
      attempts: 2,
    });
    expect(performInput).toHaveBeenNthCalledWith(1, 1);
    expect(performInput).toHaveBeenNthCalledWith(2, 2);
    expect(onRetry).toHaveBeenCalledWith({
      attempt: 1,
      nextAttempt: 2,
      actualValue: undefined,
    });
  });

  it.each([
    {
      name: 'input action failure',
      performInput: async () => {
        throw new Error('tap failed');
      },
      readValue: async () => EXPECTED_VALUE,
      message: 'tap failed',
    },
    {
      name: 'source read failure',
      performInput: async () => undefined,
      readValue: async () => {
        throw new Error('source failed');
      },
      message: 'source failed',
    },
  ])('fails immediately on an unknown $name', async (testCase) => {
    const performInput = rs.fn(testCase.performInput);
    const readValue = rs.fn(testCase.readValue);
    const onRetry = rs.fn();

    await expect(
      inputUntilObserved({
        expectedValue: EXPECTED_VALUE,
        performInput,
        readValue,
        retryIntervalMs: 0,
        onRetry,
      }),
    ).rejects.toThrow(testCase.message);
    expect(performInput).toHaveBeenCalledTimes(1);
    expect(readValue).toHaveBeenCalledTimes(
      testCase.name === 'input action failure' ? 0 : 1,
    );
    expect(onRetry).not.toHaveBeenCalled();
  });

  it('throws the last observed value after exhausting attempts', async () => {
    const performInput = rs.fn(async () => undefined);
    const readValue = rs.fn(async () => 'partial input');
    const onRetry = rs.fn();

    await expect(
      inputUntilObserved({
        expectedValue: EXPECTED_VALUE,
        performInput,
        readValue,
        maxAttempts: 3,
        retryIntervalMs: 0,
        onRetry,
      }),
    ).rejects.toEqual(
      new IOSSimulatorInputValueError(EXPECTED_VALUE, 'partial input', 3),
    );
    expect(performInput).toHaveBeenCalledTimes(3);
    expect(readValue).toHaveBeenCalledTimes(3);
    expect(onRetry).toHaveBeenCalledTimes(2);
  });

  it('rejects an invalid attempt count before performing input', async () => {
    const performInput = rs.fn(async () => undefined);
    const readValue = rs.fn(async () => EXPECTED_VALUE);

    await expect(
      inputUntilObserved({
        expectedValue: EXPECTED_VALUE,
        performInput,
        readValue,
        maxAttempts: 0,
      }),
    ).rejects.toThrow(
      'iOS Simulator input maxAttempts must be a positive integer',
    );
    expect(performInput).not.toHaveBeenCalled();
    expect(readValue).not.toHaveBeenCalled();
  });
});
