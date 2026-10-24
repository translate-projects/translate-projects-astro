# Translate Projects Astro

Translate the i18n JSON files of your Astro site with [Translate Projects](https://translateprojects.dev). Write your texts in one language and get the other languages in the folder layout `i18next` expects.

[See documentation](https://translateprojects.neiderruiz.com/docs/frameworks-javascript/astro/)

## Install

```bash
npm i -D translate-projects-astro
```

## Usage

Put your source texts in `public/locales/<sourceLang>/` (any number of `.json` files, nested keys allowed):

```
public/locales/es/translation.json
```

Create `translate.mjs`:

```js
import { translateProject } from 'translate-projects-astro';

await translateProject({
  sourceLang: 'es',
  targetLangs: ['en', 'pt-BR', 'fr'],
});
```

Run it with your project's API key:

```bash
TRANSLATE_PROJECTS_API_KEY=your-key node translate.mjs
```

Result:

```
public/locales/
├── es/translation.json   # source, never modified
├── en/translation.json
├── pt-BR/translation.json
└── fr/translation.json
```

Each output file keeps the structure of the source file (nested objects, arrays and keys with dots like `"v1.0"`).

### Options

| Option        | Type       | Default                                  | Description                                     |
| ------------- | ---------- | ---------------------------------------- | ----------------------------------------------- |
| `sourceLang`  | `string`   | —                                        | Language of the source files.                   |
| `targetLangs` | `string[]` | —                                        | Languages to generate. `sourceLang` is skipped. |
| `apiKey`      | `string`   | `process.env.TRANSLATE_PROJECTS_API_KEY` | Project API key.                                |
| `outputDir`   | `string`   | `./public/locales`                       | Folder with one subfolder per language.         |

`translateProject` returns `true` on success. On failure it logs the error, returns `false` and sets `process.exitCode = 1` (so CI fails) without killing your process.

## How it works

1. Asks the API which source files changed since the last run.
2. Sends the texts of changed files (`load-sources`).
3. Requests the translation of each language (at most 3 in parallel) and writes `<outputDir>/<lang>/<file>.json`.

A local cache (`~/.config/translate-projects-core/cache.json`) keeps the translations: a second run with no changes makes a single request and translates nothing.

### Errors

- **Invalid token, 4xx/5xx, unreachable API**: the run fails with the API message. Existing translation files are never overwritten with empty or partial data; languages that did succeed are written.
- **Partial result** (e.g. `MISSING_API_KEY`: the project has no AI key configured): untranslated texts keep the source text, a warning is printed, and they are requested again on the next run.

The AI key and model are configured in the project on translateprojects.dev, not in this package.

## Use it in Astro

Read the generated files with `i18next`, or directly with `import.meta.glob` (`src/pages/[lang]/index.astro`):

```astro
---
export function getStaticPaths() {
  const files = import.meta.glob('/public/locales/*/translation.json');
  return Object.keys(files).map((file) => ({
    params: { lang: file.split('/')[3] },
  }));
}

const files = import.meta.glob('/public/locales/*/translation.json', {
  eager: true,
  import: 'default',
});
const { lang } = Astro.params;
const t = files[`/public/locales/${lang}/translation.json`];
---

<h1>{t.title}</h1>
```

## Development

Depends on [`translate-projects-core`](../core). Until its new version is published, link it locally:

```bash
npm install --no-save ../core
npm test        # build + node:test against a local mock API (no network)
npm run lint
```

`TRANSLATE_PROJECTS_API_URL` points the core at another backend (local, staging). `npm publish` runs the tests and the build first (`prepublishOnly`).

## Support

- **Website**: [neiderruiz.com](https://neiderruiz.com)
- **GitHub**: [@neiderruiz](https://github.com/neiderruiz)
- **Twitter**: [@neiderruiz](https://x.com/neiderruiz_)
- **YouTube**: [Neider Ruiz](https://youtube.com/@neiderruiz)

[![Buy me a coffee](https://img.buymeacoffee.com/button-api/?text=Buy%20me%20a%20coffee&emoji=☕&slug=neiderruiz&button_colour=FFDD00&font_colour=000000&font_family=Cookie&outline_colour=000000&coffee_colour=ffffff)](https://www.buymeacoffee.com/neiderruiz)

## License

MIT
