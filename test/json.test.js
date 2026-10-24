const test = require('node:test');
const assert = require('node:assert');
const {
  apiKeys,
  flattenJson,
  pickTranslations,
  unflattenJson,
} = require('../dist/json');

const nested = {
  'v1.0': 'Versión',
  a: { b: ' Hola ', n: 3 },
  list: ['x', { y: 'z' }],
  skip: null,
};

test('flattenJson flattens objects and arrays and trims texts', () => {
  assert.deepStrictEqual(flattenJson(nested), {
    'v1.0': 'Versión',
    'a.b': 'Hola',
    'a.n': '3',
    'list.0': 'x',
    'list.1.y': 'z',
  });
});

test('unflattenJson rebuilds the original shape, dotted keys included', () => {
  const flat = flattenJson(nested);
  assert.deepStrictEqual(unflattenJson(nested, flat), {
    'v1.0': 'Versión',
    a: { b: 'Hola', n: '3' },
    list: ['x', { y: 'z' }],
  });
});

test('apiKeys hashes keys equal to their text, keeps the rest', async () => {
  const keys = await apiKeys({ Hola: 'Hola', 'a.b': 'Hola' });
  assert.strictEqual(keys['a.b'], 'a.b');
  assert.match(keys.Hola, /^[0-9a-z]{1,15}$/);
  assert.notStrictEqual(keys.Hola, 'Hola');
});

test('pickTranslations keeps this file keys and treats empty as missing', () => {
  const all = { a: 'A', b: '', c: 'C', other: 'X' };
  assert.deepStrictEqual(pickTranslations(all, ['a', 'b', 'd']), {
    translations: { a: 'A' },
    missing: ['b', 'd'],
  });
  assert.deepStrictEqual(pickTranslations(null, ['a']).missing, ['a']);
});
