import { JsonBase } from "translate-projects-core/types";

export const countTranslations = (obj: JsonBase): number => {
    let count = 0;
    for (const key in obj) {
        if (typeof obj[key] === 'object') {
            count += countTranslations(obj[key] as JsonBase);
        } else {
            count += 1;
        }
    }
    return count;
};