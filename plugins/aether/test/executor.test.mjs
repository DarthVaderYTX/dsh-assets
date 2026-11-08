import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeEnvironment, normalizeEnvironments } from '../dag.js';
import { LocalExecutor, resolvePlacements, safeSegment } from '../executor.js';

const node = (path, environmentId, label = path) => ({
  path,
  nodeId: path,
  label,
  environmentId,
});

test('environments always include the built-in local entry', () => {
  const environments = normalizeEnvironments([]);
  assert.equal(environments[0].id, 'local');
  assert.equal(environments[0].executor, 'local');
  assert.equal(environments[0].builtin, true);
  assert.equal(normalizeEnvironment({ id: 'gpu', name: 'GPU', executor: 'remote' }).executor, 'remote');
});

test('resolvePlacements maps local nodes and reports unavailable executors', () => {
  const environments = normalizeEnvironments([
    { id: 'local', name: '本机', executor: 'local', builtin: true },
    { id: 'gpu', name: 'GPU 集群', executor: 'remote' },
  ]);

  const local = resolvePlacements([node('a', 'local'), node('b', 'local')], environments, ['local']);
  assert.deepEqual(local.errors, []);
  assert.deepEqual(local.executors, ['local']);
  assert.deepEqual(local.placements.a, { environmentId: 'local', environmentName: '本机', executor: 'local' });

  const remote = resolvePlacements([node('a', 'gpu')], environments, ['local']);
  assert.equal(remote.errors.length, 1);
  assert.match(remote.errors[0], /执行器「remote」/);
  assert.deepEqual(remote.placements, {});

  const missing = resolvePlacements([node('a', 'nope')], environments, ['local']);
  assert.match(missing.errors[0], /执行环境「nope」不存在/);
});

test('the local executor advertises its capabilities', () => {
  const executor = new LocalExecutor();
  const descriptor = executor.describe();
  assert.equal(descriptor.id, 'local');
  assert.equal(descriptor.available, true);
  assert.equal(descriptor.supports.cancel, true);
});

test('node paths are flattened into safe directory names', () => {
  assert.equal(safeSegment('pipeline/train'), 'pipeline__train');
  assert.equal(safeSegment('a/b/c'), 'a__b__c');
  assert.equal(safeSegment(''), 'node');
});
