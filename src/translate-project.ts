import * as fs from 'fs';
import * as path from 'path';
import { validateChangesFiles } from 'translate-projects-core';
import { TypeListLang, TypeSimpleJson } from 'translate-projects-core/types';
import {
  Logger,
  makeTranslations,
  processDirectoryCache,
  readJsonFile,
  syncResources,
  updateFileCache,
} from 'translate-projects-core/utils';
import { apiKeys, flattenJson, pickTranslations, unflattenJson } from './json';

export type TranslateProjectOptions = {
  sourceLang: TypeListLang;
  targetLangs: TypeListLang[];
  /** Defaults to the TRANSLATE_PROJECTS_API_KEY environment variable */
  apiKey?: string;
  /** Folder with one subfolder per language; defaults to ./public/locales */
  outputDir?: string;
};

// shortcut: fixed limit; the backend queues tasks and a queued task gets no
// progress for up to 120 s, so keep it low until that changes
const MAX_PARALLEL_LANGS = 3;

const mapLimit = async <T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> => {
  const results: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker)
  );
  return results;
};

// tmp + rename: a crash never leaves a half-written translation file
const writeJsonAtomic = (file: string, data: unknown) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
};

/**
 * Translates every JSON file in `<outputDir>/<sourceLang>/` into
 * `<outputDir>/<lang>/` for each target language.
 * Returns true on success; on failure logs the error, sets process.exitCode = 1
 * and leaves existing translation files untouched.
 */
export const translateProject = async ({
  sourceLang,
  targetLangs,
  apiKey = process.env.TRANSLATE_PROJECTS_API_KEY,
  outputDir = './public/locales',
}: TranslateProjectOptions): Promise<boolean> => {
  try {
    if (!apiKey) {
      throw new Error(
        'apiKey is required (option apiKey or TRANSLATE_PROJECTS_API_KEY)'
      );
    }
    if (!sourceLang) throw new Error('sourceLang is required');
    if (!targetLangs?.length) throw new Error('targetLangs is required');

    const sourceDir = path.join(outputDir, sourceLang);
    if (!fs.existsSync(sourceDir)) {
      throw new Error(`Source folder not found: ${sourceDir}`);
    }

    await Logger.success(`🚀 Starting translation process...\n`);

    const { filesCache, filesPath } = await processDirectoryCache({
      dir: sourceDir,
    });

    const validated = await validateChangesFiles({ apiKey, data: filesCache });
    if (!validated) {
      throw new Error('Could not validate file changes with the API');
    }
    const changed = validated.data ?? {};

    const langs = targetLangs.filter((l) => l !== sourceLang);
    const failed: string[] = [];

    for (const [fileHash, item] of Object.entries(filesPath)) {
      const json = readJsonFile(item.path);
      if (!json) throw new Error(`Invalid JSON file: ${item.path}`);

      const flat = flattenJson(json);
      const keys = await apiKeys(flat);
      const sources: TypeSimpleJson = {};
      for (const k of Object.keys(flat)) sources[keys[k]] = flat[k];
      const sourceKeys = Object.keys(sources);

      if (!sourceKeys.length) {
        await Logger.info(`No texts found in ${item.path}\n`);
        continue;
      }

      const inCache = !changed[fileHash] && Object.keys(item.sources).length;

      if (!inCache) {
        await Logger.info(`🔄 Syncing (${sourceKeys.length}) ${item.path}\n`);
        const synced = await syncResources({
          sourceLang,
          data: sources,
          typeProject: 'astro',
          apiKey,
          route_file: item.path,
          cache_hash: item.cache_hash,
        });
        // syncResources returns null when the API or the task fails
        if (synced === null) {
          throw new Error(`Could not sync sources of ${item.path}`);
        }
        await updateFileCache({ fileHash, sources });
      }

      const isCached = (lang: TypeListLang) =>
        inCache &&
        !pickTranslations(item.translations[lang], sourceKeys).missing.length;

      const toFetch = langs.filter((l) => !isCached(l));

      const fetched = await mapLimit(toFetch, MAX_PARALLEL_LANGS, (lang) =>
        makeTranslations({
          sourceLang,
          targetLang: lang,
          apiKey,
          route_file: item.path,
          cache_hash: item.cache_hash,
        })
      );

      for (const lang of langs) {
        let picked = pickTranslations(item.translations[lang], sourceKeys);

        const i = toFetch.indexOf(lang);
        if (i !== -1) {
          // makeTranslations returns null when the API or the task fails
          if (fetched[i] === null) {
            failed.push(`${lang} (${item.path})`);
            continue;
          }
          picked = pickTranslations(fetched[i] as any, sourceKeys);
          // only real translations are cached, so missing texts are retried next run
          await updateFileCache({
            fileHash,
            translations: { [lang]: picked.translations },
          });
        }

        if (picked.missing.length) {
          await Logger.warning(
            `${picked.missing.length} texts not translated in ${item.path} (${lang}), source text kept`
          );
        }

        const out: TypeSimpleJson = {};
        for (const k of Object.keys(flat)) {
          out[k] = picked.translations[keys[k]] ?? flat[k];
        }

        const file = path.join(outputDir, lang, path.basename(item.path));
        writeJsonAtomic(file, unflattenJson(json, out));
        await Logger.success(`${lang.toUpperCase()} -> ${file}\n`);
      }
    }

    if (failed.length) {
      throw new Error(`Translation failed for: ${failed.join(', ')}`);
    }
    return true;
  } catch (error: any) {
    await Logger.error(`🛑 ${error?.message ?? error}\n`);
    // non-zero exit for CI, without killing the caller's process
    process.exitCode = 1;
    return false;
  }
};
