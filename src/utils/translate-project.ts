import * as fs from "fs";
import { getTranslationsApi } from "translate-projects-core";
import { JsonBase } from "translate-projects-core/types";
import { countTranslations } from "./count-translations";

type ConfigOptions = {
  data: JsonBase,
  outputDir: string
}

export const translateProject = async (jsonBase: JsonBase, folderSave: string, config: ConfigOptions) => {
  console.log('💊 start load data \n');
  try {
    const totalTranslations = config?.target_langs?.length || 0;
    console.log(`   🔄 Total translations to perform: ${totalTranslations} \n`);

    const totalEntries = countTranslations(jsonBase);
    console.log(`   🔄 Total entries to translate in ${config?.input}.json: ${totalEntries} \n`);

    for (const output of config?.target_langs || []) {
      console.log(`   ✅ running translations ${output} ... \n`);

      const data = await getTranslationsApi({
        data: jsonBase,
        sourceLang: config?.input,
        targetLang: output,
        typeProject: config?.typeProject ?? 'json',
        apiKey: config?.api_key,
        route_file: `${config?.input}.json`
      })

      if (!fs.existsSync(folderSave)) {
        console.log('     📦 create folder \n');
        fs.mkdirSync(folderSave, { recursive: true });
      }

      fs.writeFileSync(
        `${folderSave}/${output}.json`,
        JSON.stringify(data, null, 4)
      );

      console.log(`   📦  Finish success ${output.toUpperCase()}  ${folderSave}/${output}.json \n`);
    }

  } catch (error: any) {
    console.log(`${error.message} \n`);
    console.error("🛑 Timeout error occurred. We are aware of the issue and are working to resolve it. Please try again later... \n");
  }
};
