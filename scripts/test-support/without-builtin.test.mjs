import assert from 'node:assert/strict';
import { test } from 'node:test';
import { withoutBuiltin } from './without-builtin.mjs';

/** The shape of code the browser floor allows: detect first, fall back when missing. */
function hasOwn(object, key) {
  return typeof Object.hasOwn === 'function' ? Object.hasOwn(object, key) : Object.prototype.hasOwnProperty.call(object, key);
}

test('the fallback branch runs when the built-in is really absent', async () => {
  let typeSeen;
  const result = await withoutBuiltin(Object, 'hasOwn', () => {
    typeSeen = typeof Object.hasOwn;
    return [hasOwn({ a: 1 }, 'a'), hasOwn(Object.create({ a: 1 }), 'a')];
  });
  assert.equal(typeSeen, 'undefined');
  assert.deepEqual(result, [true, false]);
});

test('the built-in is restored afterwards, also when the callback throws', async () => {
  await assert.rejects(withoutBuiltin(URL, 'canParse', () => { throw new Error('boom'); }), /boom/);
  assert.equal(typeof Object.hasOwn, 'function');
  assert.equal(typeof URL.canParse, 'function');
});
