import { WebDriverRequestError } from '@midscene/webdriver';

/** Session-relative WDA transport, shared by input discovery and recovery. */
export type InputRequest = (
  method: 'GET' | 'POST',
  path: string,
  data?: Record<string, unknown>,
) => Promise<{ value: unknown }>;

const elementKey = 'element-6066-11e4-a52e-4f735466cecf';
function elementId(value: unknown): string {
  if (typeof value !== 'object' || value === null) {
    throw new Error('Invalid WDA input element response');
  }
  const record = value as Record<string, unknown>;
  const id = record[elementKey] || record.ELEMENT;
  if (typeof id !== 'string' || !id) {
    throw new Error('Missing WDA input element ID');
  }
  return id;
}
function isProtocolError(error: unknown, code: string): boolean {
  return (
    error instanceof WebDriverRequestError &&
    error.response?.value?.error === code
  );
}

async function activeInput(request: InputRequest): Promise<string | undefined> {
  try {
    const { value } = await request('GET', '/element/active');
    return value === null ? undefined : elementId(value);
  } catch (error) {
    if (isProtocolError(error, 'no such element')) return undefined;
    throw error;
  }
}

async function identifiedInputs(
  request: InputRequest,
  name: string,
  type: string,
): Promise<string[]> {
  const response = await request('POST', '/elements', {
    using: 'predicate string',
    // WDA name falls back to label when the accessibility identifier is empty.
    // Excluding that case proves name is an identifier on both snapshots.
    value: `name == ${JSON.stringify(name)} AND name != label AND type == ${JSON.stringify(type)}`,
  });
  if (!Array.isArray(response.value))
    throw new Error('Invalid WDA input search response');
  return response.value.map(elementId);
}

/** Clear the active input and retain focus; never continue after an unverified clear. */
export async function clearInputWithFocus(
  request: InputRequest,
): Promise<boolean> {
  let originalId: string | undefined;
  try {
    originalId = await activeInput(request);
  } catch (error) {
    // Older WDA servers may not implement active-element discovery.
    if (
      isProtocolError(error, 'unknown command') ||
      isProtocolError(error, 'unsupported operation')
    )
      return false;
    throw error;
  }
  if (!originalId) return false;

  const path = `/element/${originalId}`;
  const rawName = (await request('GET', `${path}/attribute/name`)).value;
  const name = typeof rawName === 'string' ? rawName : '';
  const type = (await request('GET', `${path}/attribute/type`)).value;
  const isTextInput =
    typeof type === 'string' &&
    [
      'XCUIElementTypeTextField',
      'XCUIElementTypeSecureTextField',
      'XCUIElementTypeTextView',
      'XCUIElementTypeSearchField',
    ].includes(type);
  const named =
    name && isTextInput ? await identifiedInputs(request, name, type) : [];
  const canReacquire = named.length === 1 && named[0] === originalId;
  let targetId = originalId;
  // One retry is allowed for an ambiguous placeholder value after a stale clear.
  // A successful clear response proves the operation completed without guessing
  // whether accessibility value represents text or placeholder text.
  for (let attempt = 0; attempt < 2; attempt++) {
    let clearError: unknown;
    try {
      await request('POST', `/element/${targetId}/clear`);
    } catch (error) {
      if (!isProtocolError(error, 'stale element reference')) throw error;
      clearError = error;
    }
    if ((await activeInput(request)) !== targetId) {
      try {
        await request('POST', `/element/${targetId}/click`);
      } catch (error) {
        if (!isProtocolError(error, 'stale element reference') || !canReacquire)
          throw error;
        const matches = await identifiedInputs(request, name, String(type));
        if (matches.length !== 1)
          throw new Error(
            'Cannot uniquely identify input after clearing the field',
          );
        targetId = matches[0];
        await request('POST', `/element/${targetId}/click`);
      }
      if ((await activeInput(request)) !== targetId)
        throw new Error(
          'Failed to restore input focus after clearing the field',
        );
    }
    if (!clearError) return true;
    const value = (await request('GET', `/element/${targetId}/attribute/value`))
      .value;
    if (value === '' || value === null) return true;
    const placeholder = (
      await request('GET', `/element/${targetId}/attribute/placeholderValue`)
    ).value;
    if (
      attempt === 0 &&
      typeof placeholder === 'string' &&
      placeholder.length > 0 &&
      value === placeholder
    )
      continue;
    throw new Error(
      'Cannot verify that input was cleared; refusing to append text',
      { cause: clearError },
    );
  }
  throw new Error('Input clear retry exhausted');
}
