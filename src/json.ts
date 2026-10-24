import { TypeJson, TypeSimpleJson } from 'translate-projects-core/types';
import { generateHashText } from 'translate-projects-core/utils';

// { a: { b: 'x' }, list: ['y'] } -> { 'a.b': 'x', 'list.0': 'y' }
export const flattenJson = (
  input: TypeJson,
  parentKey = '',
  result: TypeSimpleJson = {}
): TypeSimpleJson => {
  for (const key of Object.keys(input)) {
    const value = input[key];
    if (value === null || value === undefined) continue;
    const currentKey = parentKey ? `${parentKey}.${key}` : key;
    if (typeof value === 'object') flattenJson(value, currentKey, result);
    else result[currentKey.trim()] = String(value).trim();
  }
  return result;
};

// Rebuilds `structure` with the values of `flat`, so keys with dots ("v1.0") and arrays survive
export const unflattenJson = (
  structure: TypeJson,
  flat: TypeSimpleJson,
  parentKey = ''
): TypeJson => {
  const out: TypeJson = Array.isArray(structure) ? [] : {};
  for (const key of Object.keys(structure)) {
    const value = structure[key];
    if (value === null || value === undefined) continue;
    const currentKey = parentKey ? `${parentKey}.${key}` : key;
    if (typeof value === 'object')
      out[key] = unflattenJson(value, flat, currentKey);
    else if (flat[currentKey.trim()] !== undefined)
      out[key] = flat[currentKey.trim()];
  }
  return out;
};

// Same rule as core's assignHashKeysJson: a key equal to its text is sent as its hash
export const apiKeys = async (flat: TypeSimpleJson) => {
  const keys: TypeSimpleJson = {};
  for (const key of Object.keys(flat)) {
    keys[key] = key === flat[key] ? await generateHashText(key) : key;
  }
  return keys;
};

// The API returns every translation of the project for a language: keep this file's keys.
// Empty or absent = not translated (e.g. MISSING_API_KEY gives a partial result).
export const pickTranslations = (
  all: TypeJson | null | undefined,
  keys: string[]
) => {
  const translations: TypeSimpleJson = {};
  const missing: string[] = [];
  for (const key of keys) {
    if (typeof all?.[key] === 'string' && all[key].trim())
      translations[key] = all[key];
    else missing.push(key);
  }
  return { translations, missing };
};
