const test = require('node:test');
const assert = require('node:assert');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { startMockApi } = require('./helpers/mock-api');

const DIST = path.resolve(__dirname, '../dist');
const SOURCE_FILE = 'public/locales/es/translation.json';

// Older cores ignore TRANSLATE_PROJECTS_API_URL and would hit the real API
const coreApi = path.join(
  path.dirname(require.resolve('translate-projects-core')),
  'utils/api.js'
);
if (!('API_BASE_URL' in require(coreApi))) {
  throw new Error('translate-projects-core is too old: link ../core (README)');
}

const source = {
  'Inscribe a tu equipo': 'Inscribe a tu equipo',
  'v1.0': 'Versión 1.0',
  nav: { inicio: 'Inicio', blog: 'Blog del sitio' },
  pasos: ['Crea la cuenta', 'Publica'],
};

const makeSite = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-astro-'));
  fs.mkdirSync(path.join(dir, 'public/locales/es'), { recursive: true });
  fs.writeFileSync(path.join(dir, SOURCE_FILE), JSON.stringify(source));
  // isolated HOME so the translate-projects cache never touches the real one
  fs.mkdirSync(path.join(dir, 'home'));
  return dir;
};

// Runs translateProject in its own process, like a user's translate script
const run = (dir, apiUrl, { langs = ['en'], apiKey = 'test-key' } = {}) =>
  new Promise((resolve, reject) => {
    const script = `require(${JSON.stringify(DIST)}).translateProject({
      sourceLang: 'es', targetLangs: ${JSON.stringify(langs)} })`;
    const env = {
      ...process.env,
      HOME: path.join(dir, 'home'),
      TRANSLATE_PROJECTS_API_URL: apiUrl,
      TRANSLATE_PROJECTS_API_KEY: apiKey,
    };
    if (!apiKey) delete env.TRANSLATE_PROJECTS_API_KEY;
    const child = spawn(process.execPath, ['-e', script], { cwd: dir, env });
    let output = '';
    child.stdout.on('data', (d) => (output += d));
    child.stderr.on('data', (d) => (output += d));
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`translateProject did not exit:\n${output}`));
    }, 20000);
    child.on('exit', (code) => {
      clearTimeout(timer);
      resolve({ code, output });
    });
  });

const file = (dir, lang) =>
  path.join(dir, `public/locales/${lang}/translation.json`);
const readLang = (dir, lang) => JSON.parse(fs.readFileSync(file(dir, lang)));
const translated = (lang) => ({
  'Inscribe a tu equipo': `[${lang}] Inscribe a tu equipo`,
  'v1.0': `[${lang}] Versión 1.0`,
  nav: { inicio: `[${lang}] Inicio`, blog: `[${lang}] Blog del sitio` },
  pasos: [`[${lang}] Crea la cuenta`, `[${lang}] Publica`],
});

test('extracts the texts, sends them once and writes every language', async (t) => {
  const api = await startMockApi();
  t.after(() => api.close());
  const dir = makeSite();

  const { code, output } = await run(dir, api.url, {
    langs: ['es', 'en', 'pt-BR', 'fr'],
  });

  assert.strictEqual(code, 0, output);
  for (const lang of ['en', 'pt-BR', 'fr']) {
    assert.deepStrictEqual(readLang(dir, lang), translated(lang));
  }
  // source file untouched, source language never sent for translation
  assert.deepStrictEqual(readLang(dir, 'es'), source);
  assert.strictEqual(api.count('/v1/translations/load-sources'), 1);
  assert.strictEqual(api.count('/v1/translations/'), 3);

  const sync = api.state.requests.find(
    (r) => r.path === '/v1/translations/load-sources'
  );
  assert.strictEqual(sync.q.type_project, 'astro');
  assert.strictEqual(sync.q.source_lang, 'es');
  // a key equal to its text goes as its hash, the others as their flat key
  assert.deepStrictEqual(
    Object.values(sync.body).sort(),
    [
      'Blog del sitio',
      'Crea la cuenta',
      'Inicio',
      'Inscribe a tu equipo',
      'Publica',
      'Versión 1.0',
    ].sort()
  );
  assert.ok(sync.body['nav.inicio'] && sync.body['pasos.0']);
  assert.ok(!('Inscribe a tu equipo' in sync.body));
});

test('files in subfolders keep their path in every language', async (t) => {
  const api = await startMockApi();
  t.after(() => api.close());
  const dir = makeSite();
  fs.mkdirSync(path.join(dir, 'public/locales/es/blog'));
  fs.writeFileSync(
    path.join(dir, 'public/locales/es/blog/translation.json'),
    JSON.stringify({ post: 'Mi primer post' })
  );

  const { code, output } = await run(dir, api.url);

  assert.strictEqual(code, 0, output);
  assert.deepStrictEqual(readLang(dir, 'en'), translated('en'));
  assert.deepStrictEqual(
    JSON.parse(
      fs.readFileSync(path.join(dir, 'public/locales/en/blog/translation.json'))
    ),
    { post: '[en] Mi primer post' }
  );
});

test('a second run with no changes translates nothing and restores deleted files', async (t) => {
  const api = await startMockApi();
  t.after(() => api.close());
  const dir = makeSite();

  assert.strictEqual((await run(dir, api.url)).code, 0);
  fs.rmSync(path.join(dir, 'public/locales/en'), { recursive: true });
  const second = await run(dir, api.url);

  assert.strictEqual(second.code, 0, second.output);
  assert.strictEqual(api.count('/v1/translations/load-sources'), 1);
  assert.strictEqual(api.count('/v1/translations/'), 1);
  assert.deepStrictEqual(readLang(dir, 'en'), translated('en'));
});

test('deleting the cache file forces a full translation', async (t) => {
  const api = await startMockApi();
  t.after(() => api.close());
  const dir = makeSite();

  assert.strictEqual((await run(dir, api.url)).code, 0);
  fs.rmSync(path.join(dir, 'home/.config/translate-projects-core/cache.json'));
  const second = await run(dir, api.url);

  assert.strictEqual(second.code, 0, second.output);
  assert.strictEqual(api.count('/v1/translations/load-sources'), 2);
  assert.strictEqual(api.count('/v1/translations/'), 2);
});

test('a changed source file is synced and translated again', async (t) => {
  const api = await startMockApi();
  t.after(() => api.close());
  const dir = makeSite();

  assert.strictEqual((await run(dir, api.url)).code, 0);
  fs.writeFileSync(
    path.join(dir, SOURCE_FILE),
    JSON.stringify({ ...source, nuevo: 'Texto nuevo' })
  );
  const second = await run(dir, api.url);

  assert.strictEqual(second.code, 0, second.output);
  assert.strictEqual(api.count('/v1/translations/load-sources'), 2);
  assert.strictEqual(api.count('/v1/translations/'), 2);
  assert.strictEqual(readLang(dir, 'en').nuevo, '[en] Texto nuevo');
});

test('an invalid token exits 1 and leaves existing translations untouched', async (t) => {
  const api = await startMockApi({
    failStatus: { '/v1/translations/validate-changes-files': 401 },
  });
  t.after(() => api.close());
  const dir = makeSite();
  fs.mkdirSync(path.dirname(file(dir, 'en')), { recursive: true });
  fs.writeFileSync(file(dir, 'en'), '{"keep":"me"}');

  const { code, output } = await run(dir, api.url);

  assert.strictEqual(code, 1);
  assert.match(output, /API Error \(401\): Invalid token/);
  assert.strictEqual(fs.readFileSync(file(dir, 'en'), 'utf8'), '{"keep":"me"}');
  assert.strictEqual(api.count('/v1/translations/'), 0);
});

test('a 4xx while syncing sources exits 1 without writing anything', async (t) => {
  const api = await startMockApi({
    failStatus: { '/v1/translations/load-sources': 403 },
  });
  t.after(() => api.close());
  const dir = makeSite();

  const { code, output } = await run(dir, api.url);

  assert.strictEqual(code, 1);
  assert.match(output, /Could not sync sources/);
  assert.ok(!fs.existsSync(file(dir, 'en')));
});

test('a 5xx on one language writes the others and keeps that language file', async (t) => {
  const api = await startMockApi({ failLangs: ['fr'] });
  t.after(() => api.close());
  const dir = makeSite();
  fs.mkdirSync(path.dirname(file(dir, 'fr')), { recursive: true });
  fs.writeFileSync(file(dir, 'fr'), '{"ancien":"fichier"}');

  const { code, output } = await run(dir, api.url, { langs: ['en', 'fr'] });

  assert.strictEqual(code, 1);
  assert.match(output, /API Error \(500\)/);
  assert.match(output, /Translation failed for: fr/);
  assert.deepStrictEqual(readLang(dir, 'en'), translated('en'));
  assert.deepStrictEqual(readLang(dir, 'fr'), { ancien: 'fichier' });

  // the failed language is retried next run, the good one comes from cache
  const api2 = await startMockApi();
  t.after(() => api2.close());
  api2.state.seenHashes = api.state.seenHashes;
  api2.state.sources = api.state.sources;
  const second = await run(dir, api2.url, { langs: ['en', 'fr'] });
  assert.strictEqual(second.code, 0, second.output);
  assert.deepStrictEqual(
    api2.state.requests
      .filter((r) => r.path === '/v1/translations/')
      .map((r) => r.q.target_lang),
    ['fr']
  );
  assert.deepStrictEqual(readLang(dir, 'fr'), translated('fr'));
});

test('a partial response (MISSING_API_KEY) keeps the source text and retries it next run', async (t) => {
  const api = await startMockApi({ partial: { en: ['Inicio'] } });
  t.after(() => api.close());
  const dir = makeSite();

  const { code, output } = await run(dir, api.url);

  assert.strictEqual(code, 0, output);
  assert.match(output, /1 texts not translated/);
  const en = readLang(dir, 'en');
  assert.strictEqual(en.nav.inicio, 'Inicio');
  assert.strictEqual(en.nav.blog, '[en] Blog del sitio');

  // project key configured now: the missing text is requested again
  const api2 = await startMockApi();
  t.after(() => api2.close());
  api2.state.seenHashes = api.state.seenHashes;
  api2.state.sources = api.state.sources;
  const second = await run(dir, api2.url);
  assert.strictEqual(second.code, 0, second.output);
  assert.strictEqual(api2.count('/v1/translations/'), 1);
  assert.deepStrictEqual(readLang(dir, 'en'), translated('en'));
});

test('without an API key it exits 1 before any request', async (t) => {
  const api = await startMockApi();
  t.after(() => api.close());
  const dir = makeSite();

  const { code, output } = await run(dir, api.url, { apiKey: '' });

  assert.strictEqual(code, 1);
  assert.match(output, /apiKey is required/);
  assert.strictEqual(api.state.requests.length, 0);
});

test('an unreachable API exits 1 instead of hanging', async () => {
  const dir = makeSite();
  const { code, output } = await run(dir, 'http://127.0.0.1:1');
  assert.strictEqual(code, 1);
  assert.match(output, /Could not validate file changes/);
});

test('an invalid source JSON exits 1 and writes nothing', async (t) => {
  const api = await startMockApi();
  t.after(() => api.close());
  const dir = makeSite();
  fs.writeFileSync(path.join(dir, SOURCE_FILE), '{ not json');

  const { code, output } = await run(dir, api.url);

  assert.strictEqual(code, 1);
  assert.match(output, /Invalid JSON file/);
  assert.ok(!fs.existsSync(file(dir, 'en')));
});
