module.exports = {
    root: true,
    parserOptions: {
        sourceType: 'script',
        ecmaVersion: 5
    },
    env: {
        browser: true,
    },
    extends: 'es5', // https://github.com/ipluser/eslint-config-es5
    rules: {
        indent: ['error', 4],
        camelcase: 0,
        'no-alert': 0,
        'no-console': 0,
        'linebreak-style': [0, 'windows'],
        'no-underscore-dangle': 0,
        'no-param-reassign': 0,
        'max-len': 0,
        'no-plusplus': 0,
        'arrow-body-style': 0,
        'func-names': 0,
        'new-cap': 0,
        'consistent-return': 0,
        'valid-jsdoc': 0
    },
    globals: {
        window: true,
        document: true,
        location: true,
        history: true,
        $: true,
        alert: true,
        confirm: true,
        sessionStorage: true
    }
};
