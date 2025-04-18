// commitlint.config.js
module.exports = {
    extends: ['@commitlint/config-conventional'],
    rules: {
        'scope-enum': [
            2, // Level: Error
            'always', // Apply rule always
            [
                // Allowed scopes
                'core',
                'workflow',
                'android',
                'llm',
                'playwright',
                'puppeteer',
                'mcp',
                'bridge',
                // Add other relevant scopes for your project if needed
            ],
        ],
        // Add rule to disallow empty scopes
        'scope-empty': [2, 'never'],
    },
};