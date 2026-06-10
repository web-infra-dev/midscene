import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  discoverSkills,
  renderSkillsForPrompt,
  selectSkills,
} from '../../src/skills';
import type { Skill } from '../../src/types';

const tmpDirs: string[] = [];

async function makeTmpDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'midscene-bdd-skills-'));
  tmpDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(
    tmpDirs
      .splice(0)
      .map((dir) => fs.rm(dir, { recursive: true, force: true })),
  );
});

function skill(name: string, content: string): Skill {
  return { name, content, file: `/skills/${name}.md` };
}

describe('discoverSkills', () => {
  it('discovers flat <name>.md files', async () => {
    const dir = await makeTmpDir();
    await fs.writeFile(path.join(dir, 'check-logs.md'), '# Check logs\n');
    await fs.writeFile(path.join(dir, 'login.md'), 'Login steps');

    const skills = await discoverSkills(dir);

    expect(Array.from(skills.keys())).toEqual(['check-logs', 'login']);
    expect(skills.get('check-logs')).toEqual({
      name: 'check-logs',
      content: '# Check logs\n',
      file: path.join(dir, 'check-logs.md'),
    });
    expect(skills.get('login')?.content).toBe('Login steps');
  });

  it('discovers folder <name>/SKILL.md layout', async () => {
    const dir = await makeTmpDir();
    await fs.mkdir(path.join(dir, 'deploy'));
    await fs.writeFile(path.join(dir, 'deploy', 'SKILL.md'), 'Deploy stuff');

    const skills = await discoverSkills(dir);

    expect(Array.from(skills.keys())).toEqual(['deploy']);
    expect(skills.get('deploy')).toEqual({
      name: 'deploy',
      content: 'Deploy stuff',
      file: path.join(dir, 'deploy', 'SKILL.md'),
    });
  });

  it('mixes both layouts with sorted iteration order', async () => {
    const dir = await makeTmpDir();
    await fs.writeFile(path.join(dir, 'zeta.md'), 'z');
    await fs.mkdir(path.join(dir, 'alpha'));
    await fs.writeFile(path.join(dir, 'alpha', 'SKILL.md'), 'a');
    await fs.writeFile(path.join(dir, 'mid.md'), 'm');

    const skills = await discoverSkills(dir);

    expect(Array.from(skills.keys())).toEqual(['alpha', 'mid', 'zeta']);
  });

  it('throws on duplicate names across layouts, naming both files', async () => {
    const dir = await makeTmpDir();
    await fs.writeFile(path.join(dir, 'deploy.md'), 'flat');
    await fs.mkdir(path.join(dir, 'deploy'));
    await fs.writeFile(path.join(dir, 'deploy', 'SKILL.md'), 'folder');

    await expect(discoverSkills(dir)).rejects.toThrow(
      /\[midscene-bdd\] Duplicate skill name "deploy"/,
    );
    await expect(discoverSkills(dir)).rejects.toThrow('deploy.md');
    await expect(discoverSkills(dir)).rejects.toThrow(
      path.join('deploy', 'SKILL.md'),
    );
  });

  it('returns an empty map for a non-existent directory', async () => {
    const dir = await makeTmpDir();
    const skills = await discoverSkills(path.join(dir, 'does-not-exist'));
    expect(skills.size).toBe(0);
  });

  it('ignores non-.md files and folders without SKILL.md', async () => {
    const dir = await makeTmpDir();
    await fs.writeFile(path.join(dir, 'notes.txt'), 'not a skill');
    await fs.writeFile(path.join(dir, 'README'), 'not a skill');
    await fs.mkdir(path.join(dir, 'empty-folder'));
    await fs.writeFile(path.join(dir, 'real.md'), 'real');

    const skills = await discoverSkills(dir);

    expect(Array.from(skills.keys())).toEqual(['real']);
  });
});

describe('selectSkills', () => {
  it('resolves tokens to skills', () => {
    const map = new Map<string, Skill>([
      ['a', skill('a', 'A')],
      ['b', skill('b', 'B')],
    ]);
    expect(selectSkills(['b', 'a'], map)).toEqual([
      skill('b', 'B'),
      skill('a', 'A'),
    ]);
  });

  it('dedupes while preserving first-mention order', () => {
    const map = new Map<string, Skill>([
      ['a', skill('a', 'A')],
      ['b', skill('b', 'B')],
    ]);
    const result = selectSkills(['b', 'a', 'b', 'a'], map);
    expect(result.map((s) => s.name)).toEqual(['b', 'a']);
  });

  it('throws for missing tokens, listing available skills sorted', () => {
    const map = new Map<string, Skill>([
      ['zeta', skill('zeta', 'Z')],
      ['alpha', skill('alpha', 'A')],
    ]);
    expect(() => selectSkills(['nope'], map)).toThrow(
      '[midscene-bdd] Unknown skill $nope. Available skills: alpha, zeta (looked in the skills directory)',
    );
  });

  it('reports (none) when no skills are available', () => {
    expect(() => selectSkills(['nope'], new Map())).toThrow(
      '[midscene-bdd] Unknown skill $nope. Available skills: (none) (looked in the skills directory)',
    );
  });
});

describe('renderSkillsForPrompt', () => {
  it('renders empty input as empty string', () => {
    expect(renderSkillsForPrompt([])).toBe('');
  });

  it('renders skill sections with header line and trimmed content', () => {
    const rendered = renderSkillsForPrompt([
      skill('check-logs', '\nLook at the logs.\n\n'),
      skill('deploy', 'Run the deploy.'),
    ]);

    expect(rendered).toBe(
      'The following skill instructions are available for this task:\n' +
        '## Skill: check-logs\nLook at the logs.\n' +
        '\n' +
        '## Skill: deploy\nRun the deploy.\n',
    );

    const checkLogsIdx = rendered.indexOf('## Skill: check-logs');
    const deployIdx = rendered.indexOf('## Skill: deploy');
    expect(checkLogsIdx).toBeGreaterThan(-1);
    expect(deployIdx).toBeGreaterThan(checkLogsIdx);
  });
});
