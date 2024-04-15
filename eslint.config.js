import globals from "globals";
import pluginJs from "@eslint/js";
import tseslint from "typescript-eslint";
import eslintPluginPrettier from "eslint-plugin-prettier/recommended";

export default [
    {
        ignores: ["dist/*", "docs/*", ".github/*", ".changeset/*"],
    },

    // Use node globals
    { languageOptions: { globals: globals.node } },

    // Use recommended JS config
    pluginJs.configs.recommended,

    // Use recommended TS config
    ...tseslint.configs.recommended,

    // Allow unused variables that start with _
    {
        rules: {
            "no-unused-vars": "off",
            "@typescript-eslint/no-unused-vars": [
                "warn",
                {
                    argsIgnorePattern: "^_",
                    varsIgnorePattern: "^_",
                    caughtErrorsIgnorePattern: "^_",
                },
            ],
        },
    },

    // Delegate to prettier as last plugin
    eslintPluginPrettier,
];
