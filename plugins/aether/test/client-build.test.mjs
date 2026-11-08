import assert from 'node:assert/strict';
import { promises as fsp } from 'node:fs';
import test from 'node:test';

import { readClientSource } from '../scripts/build-client.mjs';

test('client.js matches the fragments in client/src', async () => {
  const bundle = await fsp.readFile(new URL('../client.js', import.meta.url), 'utf8');
  const source = await readClientSource();
  assert.equal(
    bundle.trimEnd(),
    source.trimEnd(),
    'client.js is stale; run: node scripts/build-client.mjs',
  );
});
