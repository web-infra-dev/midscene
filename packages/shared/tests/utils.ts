import { join } from 'node:path';

export function getFixture(name: string) {
  return join(__dirname, 'fixtures', name);
}
