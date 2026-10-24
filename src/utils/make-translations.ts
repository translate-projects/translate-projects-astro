const makeTranslations = async (idDoc: string, config?: ConfigOptionsAstro) => {
    const localesPath = './public/locales';
    await translateFileCsv(idDoc, localesPath, config);
    const files = fs.readdirSync(localesPath);
    const jsonFiles = files.filter(file => path.extname(file) === '.json')
        .map(file => file.replace('.json', ''));
    const existingCodes = jsonFiles.filter(code => langs.some(lang => lang.code === code));

    existingCodes.forEach((element) => {
        renameFiles(element);
    });

};