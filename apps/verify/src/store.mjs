import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

export class Store {
  constructor(root) {
    this.root = root;
  }

  file(collection, id) {
    if (!/^[a-z]+$/.test(collection) || !/^[\w-]+$/.test(id)) {
      throw new Error('Invalid storage key');
    }
    return path.join(this.root, collection, `${id}.json`);
  }

  async get(collection, id) {
    try {
      return JSON.parse(await readFile(this.file(collection, id), 'utf8'));
    } catch (error) {
      if (error.code === 'ENOENT') return undefined;
      throw error;
    }
  }

  async put(collection, id, value) {
    const target = this.file(collection, id);
    await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
    const temp = `${target}.${randomUUID()}.tmp`;
    await writeFile(temp, JSON.stringify(value, null, 2), { mode: 0o600 });
    await rename(temp, target);
  }

  async list(collection) {
    let entries;
    try {
      entries = await readdir(path.join(this.root, collection));
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw error;
    }
    return Promise.all(
      entries
        .filter((name) => name.endsWith('.json'))
        .map((name) => this.get(collection, name.slice(0, -5))),
    );
  }
}
