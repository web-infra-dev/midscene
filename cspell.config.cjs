const {
    banWords
} = require('cspell-ban-words');

module.exports = {
    version: '0.2',
    language: 'en',
    files: ['**/*.{ts,tsx,js,jsx,md,mdx}'],
    enableFiletypes: ['mdx'],
    ignoreRegExpList: [
        // ignore markdown anchors such as [modifyRsbuildConfig](#modifyrsbuildconfig)
        '#.*?\\)',
    ],
    ignorePaths: [
        'dist',
        'dist-*',
        'compiled',
        'coverage',
        'doc_build',
        'node_modules',
        'pnpm-lock.yaml',
        'midscene_run',
    ],
    flagWords: banWords,
    dictionaries: ['dictionary'],
    dictionaryDefinitions: [{
        name: 'dictionary',
        path: './scripts/dictionary.txt',
        addWords: true,
    }, ],
};