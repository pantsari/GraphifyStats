/** @type {import("eslint").Linter.Config[]} */
export default [
  {
    ignores: ["node_modules/**", "coverage/**", "*.vsix"],
  },
  {
    files: ["**/*.js"],
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
];
