import tseslint from "./studio/node_modules/typescript-eslint/dist/index.js";
export default tseslint.config({
  files: [
    "server/src/studio/**/*.ts",
    "contracts/**/*.ts",
    "browser-worker/src/**/*.ts",
  ],
  extends: [...tseslint.configs.recommended],
  rules: {
    "@typescript-eslint/no-unused-vars": [
      "error",
      { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
    ],
    "no-empty": ["error", { allowEmptyCatch: true }],
  },
});
