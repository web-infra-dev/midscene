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

async function namedInputs(
  request: InputRequest,
  name: string,
): Promise<string[]> {
  const response = await request('POST', '/elements', {
    using: 'accessibility id',
    value: name,
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
  const named =
    typeof name === 'string' && name ? await namedInputs(request, name) : [];
  const canReacquire = named.length === 1 && named[0] === originalId;
  let clearError: unknown;
  try {
    await request('POST', `${path}/clear`);
  } catch (error) {
    if (!isProtocolError(error, 'stale element reference')) throw error;
    // A blur callback can invalidate WDA's cache after the field was cleared.
    clearError = error;
  }

  let targetId = originalId;
  if ((await activeInput(request)) !== originalId) {
    try {
      await request('POST', `${path}/click`);
    } catch (error) {
      if (!isProtocolError(error, 'stale element reference') || !canReacquire)
        throw error;
      const matches = await namedInputs(request, name);
      if (matches.length !== 1)
        throw new Error(
          'Cannot uniquely identify input after clearing the field',
        );
      targetId = matches[0];
      await request('POST', `/element/${targetId}/click`);
    }
    if ((await activeInput(request)) !== targetId)
      throw new Error('Failed to restore input focus after clearing the field');
  }
  if (clearError) {
    const value = (await request('GET', `/element/${targetId}/attribute/value`))
      .value;
    if (value !== '')
      throw new Error(
        'Cannot verify that input was cleared; refusing to append text',
        { cause: clearError },
      );
  }
  return true;
}
