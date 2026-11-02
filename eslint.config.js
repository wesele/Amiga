import js from "@eslint/js";
import pluginVue from "eslint-plugin-vue";
import globals from "globals";

// Only bug-catching rules. Formatting is Prettier's job, so style rules stay off.
const bugRules = {
  "no-undef": "error",
  // Unused vars are almost always leftovers from a refactor, not runtime bugs.
  // `args: "none"` because unused callback params are idiomatic here.
  "no-unused-vars": ["warn", { args: "none", caughtErrors: "none" }],
  "no-dupe-keys": "error",
  "no-unreachable": "error",
  "no-const-assign": "error",
  // Empty blocks are noisy but catch real "forgot to implement" spots; empty
  // catch blocks are a deliberate pattern in this codebase.
  "no-empty": ["warn", { allowEmptyCatch: true }],
  "no-useless-escape": "warn",
};

export default [
  {
    ignores: [
      "**/node_modules/**",
      "dist/**",
      "dist_tv/**",
      "src-tauri/**",
      "content-studio/**",
      "cloudflare-chat/**",
      "public/**",
      "docs/**",
    ],
  },

  // eslint:recommended gives the broad "real bug" baseline (no-fallthrough,
  // no-redeclare, no-self-assign, no-dupe-else-if, ...).
  js.configs.recommended,

  // Vue SFC support. "essential" instead of "recommended": the extra
  // recommended rules are mostly naming/ordering preferences.
  ...pluginVue.configs["flat/essential"],

  // Browser code.
  {
    files: ["src/**/*.{js,vue}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.es2022,
      },
    },
    rules: bugRules,
  },

  // Node-side scripts, tooling configs and the deploy server.
  {
    files: [
      "scripts/**/*.{js,cjs,mjs}",
      "deploy/**/*.js",
      "vite.config.js",
      "vitest.config.js",
      "eslint.config.js",
    ],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.node,
        ...globals.es2022,
      },
    },
    rules: bugRules,
  },

  // CommonJS scripts.
  {
    files: ["scripts/**/*.cjs"],
    languageOptions: {
      sourceType: "commonjs",
    },
  },

  // Tests: vitest globals, plus node globals because specs use __dirname/global.
  {
    files: ["**/__tests__/**/*.{js,vue}", "**/*.{spec,test}.{js,vue}"],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.vitest,
      },
    },
  },

  // ---- Rule overrides for pre-existing code (kept as warn or off, never error) ----

  {
    files: ["**/*.{js,cjs,mjs,vue}"],
    rules: {
      // Dead-store detection: no runtime bug, and it fires on intentional
      // "assign then reassign in a branch" patterns. Off to keep output useful.
      "no-useless-assignment": "off",
      // Asks for `{ cause: err }` on rethrows; a style preference, not a bug.
      "preserve-caught-error": "off",
      // Mostly cosmetic ("spaces are hard to count"); 4 pre-existing hits.
      "no-regex-spaces": "warn",
      // Real bug class, but 1 pre-existing hit (prop shadowed by a local ref).
      "vue/no-dupe-keys": "warn",
      // Real bug class, but 1 pre-existing hit; prop mutation in CoursewareModal.
      "vue/no-mutating-props": "warn",
    },
  },
];
