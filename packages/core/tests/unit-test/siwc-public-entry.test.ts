import { describe, expect, it } from '@rstest/core';
import * as authorization from '../../src/ai-model/service-caller/openai/siwc/authorization';
import * as refresh from '../../src/ai-model/service-caller/openai/siwc/refresh';
import {
  SiwcError,
  createSiwcAuthorization,
  exchangeSiwcCode,
  parseSiwcCallback,
  refreshSiwcCredentials,
} from '../../src/siwc';

describe('public SIWC entry', () => {
  it('exposes the existing authorization implementation without a second protocol stack', () => {
    expect(refreshSiwcCredentials).toBe(refresh.refreshSiwcCredentials);
    expect(createSiwcAuthorization).toBe(authorization.createSiwcAuthorization);
    expect(exchangeSiwcCode).toBe(authorization.exchangeSiwcCode);
    expect(parseSiwcCallback).toBe(authorization.parseSiwcCallback);
    expect(new SiwcError('fixture').name).toBe('SiwcError');
  });
});
