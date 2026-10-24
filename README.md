# Translate Projects Astro

Translate the i18n JSON files of your Astro site with [Translate Projects](https://translateprojects.dev). Write your texts in one language, run one command, and get every other language in the folder layout `i18next` expects (`public/locales/<lang>/translation.json`).

[See documentation](https://translateprojects.neiderruiz.com/docs/frameworks-javascript/astro/)

## Quick reference

| What         | Value                                                                   |
| ------------ | ----------------------------------------------------------------------- |
| Install      | `npm i -D translate-projects-astro`                                     |
| API key      | env var `TRANSLATE_PROJECTS_API_KEY` (or the `apiKey` option)           |
| Source files | `public/locales/<sourceLang>/*.json`                                    |
| Generated    | `public/locales/<lang>/*.json`, one folder per target language          |
| Command      | `node translate.mjs` (run from the site root)                           |
| Cache        | `~/.config/translate-projects-core/cache.json`                          |
| Force        | delete that cache file and run again                                    |
| Exit code    | `0` success, `1` error (`process.exitCode`, your process keeps running) |

## Requirements

- **Node.js 18 or newer.**
- A project on [translateprojects.dev](https://translateprojects.dev) and its **API key**.
- The project's **AI model and AI key configured** in translateprojects.dev. Without them only texts that already have a translation are filled in (see [Errors](#common-errors)).
- Your source texts as JSON files in `public/locales/<sourceLang>/`.

Astro itself is not required by this package: it only reads and writes JSON files.

## 1. Install

```bash
npm i -D translate-projects-astro
```

## 2. Set the API key

Copy the API key of your project from translateprojects.dev and expose it as `TRANSLATE_PROJECTS_API_KEY`:

```bash
export TRANSLATE_PROJECTS_API_KEY=your-project-api-key
```

Or put it in a `.env` file (do not commit it; add `.env` to `.gitignore`):

```bash
TRANSLATE_PROJECTS_API_KEY=your-project-api-key
```

The key identifies the project, so no project id is needed anywhere else.

## 3. Write your source texts

`public/locales/es/translation.json`:

```json
{
  "title": "Bienvenido a nuestro torneo",
  "nav": { "home": "Inicio", "teams": "Equipos" },
  "Inscribe a tu equipo": "Inscribe a tu equipo"
}
```

Any number of `.json` files is allowed in that folder (subfolders are included). Nested objects, arrays and keys with dots (`"v1.0"`) are supported. Numbers and booleans are translated as text.

## 4. Configure

Create `translate.mjs` at the root of your site:

```js
import { translateProject } from 'translate-projects-astro';

await translateProject({
  sourceLang: 'es',
  targetLangs: ['en', 'pt-BR', 'fr'],
});
```

| Option        | Type       | Required | Default                                  | Description                                                                    |
| ------------- | ---------- | -------- | ---------------------------------------- | ------------------------------------------------------------------------------ |
| `sourceLang`  | `string`   | yes      | —                                        | Language of the source files (`'es'`, `'en'`, `'pt-BR'`…).                     |
| `targetLangs` | `string[]` | yes      | —                                        | Languages to generate. If it contains `sourceLang`, that one is skipped.       |
| `apiKey`      | `string`   | no       | `process.env.TRANSLATE_PROJECTS_API_KEY` | Project API key. Prefer the environment variable over hardcoding it.           |
| `outputDir`   | `string`   | no       | `./public/locales`                       | Folder with one subfolder per language, relative to where you run the command. |

`translateProject` returns a `Promise<boolean>`: `true` on success, `false` on error.

## 5. Run

Add a script to `package.json`:

```json
{
  "scripts": {
    "translate": "node translate.mjs"
  }
}
```

```bash
npm run translate
```

With a `.env` file (Node.js 20.6+):

```json
{
  "scripts": {
    "translate": "node --env-file=.env translate.mjs"
  }
}
```

Always run it from the root of the site: `outputDir` and the cache depend on the current folder.

## Generated files

```
public/locales/
├── es/translation.json      # your source, never modified
├── en/translation.json      # generated
├── pt-BR/translation.json   # generated
└── fr/translation.json      # generated
```

Each generated file has the same name, keys and structure as its source file; only the values are translated. `public/locales/en/translation.json` from the example above:

```json
{
  "title": "Welcome to our tournament",
  "nav": { "home": "Home", "teams": "Teams" },
  "Inscribe a tu equipo": "Register your team"
}
```

Commit the generated files with your site. Do not edit them by hand: the next run that translates that language overwrites them.

### Use them in Astro

With `i18next`, or directly with `import.meta.glob` (`src/pages/[lang]/index.astro`):

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

## Cache

Each run:

1. Asks the API which source files changed since the last run.
2. Sends only the texts of changed files.
3. Requests only the languages that are not complete in the cache (at most 3 languages in parallel) and writes their files.

The translations are saved in `~/.config/translate-projects-core/cache.json` (on Windows `%APPDATA%\translate-projects-core\cache.json`), per site folder. So:

- **No changes**: one request, nothing is translated, the files are written again from the cache (a deleted generated file comes back).
- **A source file changed**: that file is sent again and translated into every language.
- **A new language in `targetLangs`**: only that language is requested.
- **A language that failed or came back incomplete**: it is requested again on the next run.

### Force a full translation

Delete the cache file and run again:

```bash
rm ~/.config/translate-projects-core/cache.json
npm run translate
```

This cache is shared by every project that uses Translate Projects on this machine; deleting it only makes the next run of each project translate again. Deleting the generated files is **not** enough: they are rebuilt from the cache.

## Common errors

Every error is printed with the message from the API, the run ends with exit code `1`, and **existing translation files are never overwritten with empty or broken data**. Languages that succeeded in the same run are written.

| Message                                                                                              | Cause                                                                                                             | Fix                                                                                                                                                                             |
| ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apiKey is required (option apiKey or TRANSLATE_PROJECTS_API_KEY)`                                   | No API key.                                                                                                       | Set `TRANSLATE_PROJECTS_API_KEY` in the shell that runs the command.                                                                                                            |
| `API Error (401): UNAUTHORIZED: Token no válido` then `Could not validate file changes with the API` | Invalid, revoked or mistyped API key.                                                                             | Copy the project's API key again from translateprojects.dev.                                                                                                                    |
| `N texts not translated in <file> (<lang>), source text kept` (warning, exit `0`)                    | The project has no AI model / AI key (`MISSING_API_KEY`), so only texts that already had a translation came back. | Configure the model and AI key of the project in translateprojects.dev and run again: only the missing texts are requested. Until then those texts stay in the source language. |
| `Translation failed for: <lang> (<file>)`                                                            | The API failed for that language (4xx/5xx).                                                                       | Run again; the language is retried. The previous file of that language is kept.                                                                                                 |
| `Could not sync sources of <file>`                                                                   | The API rejected the source texts.                                                                                | Check the message printed just before it.                                                                                                                                       |
| `Could not validate file changes with the API` after `Request failed` / `Max retries reached`        | No connection to the API (network, proxy, firewall).                                                              | Check the connection and run again. Server errors 429/502/503/504 are retried automatically.                                                                                    |
| `Source folder not found: public/locales/es`                                                         | Wrong `sourceLang`/`outputDir`, or run from another folder.                                                       | Run from the site root, check that the folder exists.                                                                                                                           |
| `Invalid JSON file: <file>`                                                                          | A source file is not valid JSON.                                                                                  | Fix the file. Nothing is written.                                                                                                                                               |

## Development

Depends on [`translate-projects-core`](../core). Until its new version is published, link it locally:

```bash
npm install --no-save ../core
npm test        # build + node:test against a local mock API (no network)
npm run lint
```

`TRANSLATE_PROJECTS_API_URL` points the core at another backend (local, staging). `npm publish` runs the build and the tests first (`prepublishOnly`).

## Support

- **Website**: [neiderruiz.com](https://neiderruiz.com)
- **GitHub**: [@neiderruiz](https://github.com/neiderruiz)
- **Twitter**: [@neiderruiz](https://x.com/neiderruiz_)
- **YouTube**: [Neider Ruiz](https://youtube.com/@neiderruiz)

[![Buy me a coffee](https://img.buymeacoffee.com/button-api/?text=Buy%20me%20a%20coffee&emoji=☕&slug=neiderruiz&button_colour=FFDD00&font_colour=000000&font_family=Cookie&outline_colour=000000&coffee_colour=ffffff)](https://www.buymeacoffee.com/neiderruiz)

## License

MIT
