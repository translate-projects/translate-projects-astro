import fs from "fs";
import path from "path";

export const renameFiles = (language: string) => {
    const localesPath = './public/locales'
    const outputDir = path.join(localesPath, language);
    const translatedFilePath = path.join(localesPath, `${language}.json`);
    const newFilePath = path.join(localesPath, language, 'translation.json');
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }
    if (fs.existsSync(translatedFilePath)) {
        fs.renameSync(translatedFilePath, newFilePath);
        console.log(`✅ Archivo ${language}.json translated and renamed to translation.json \n`);
    } else {
        console.log(`🛑 Archivo ${language}.json not found`);
    }
}