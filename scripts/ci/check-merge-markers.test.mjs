import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const checker = join(import.meta.dirname, 'check-merge-markers.mjs');

for (const marker of ['<' .repeat(7), '='.repeat(7), '>'.repeat(7)]) {
  test(`exits non-zero for ${marker}`, () => {
    const root = mkdtempSync(join(tmpdir(), 'merge-marker-check-'));
    try {
      spawnSync('git', ['init', '--quiet', root], { encoding: 'utf8' });
      writeFileSync(join(root, 'fixture.txt'), `${marker} fixture\n`);
      const add = spawnSync('git', ['-C', root, 'add', 'fixture.txt'], { encoding: 'utf8' });
      assert.equal(add.status, 0, add.stderr);

      const result = spawnSync(process.execPath, [checker, '--root', root], { encoding: 'utf8' });
      assert.notEqual(result.status, 0, result.stdout + result.stderr);
      assert.match(result.stderr, /fixture\.txt:1/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}
