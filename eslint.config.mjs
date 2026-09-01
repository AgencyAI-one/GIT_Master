import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Async resource hydration and controlled editor resets are intentional in this app.
      "react-hooks/set-state-in-effect": "off",
      // GitHub Enterprise/avatar hosts are user-configured and cannot be declared at build time.
      "@next/next/no-img-element": "off",
    },
  },
  globalIgnores([".next/**", "coverage/**", "playwright-report/**", "test-results/**"]),
]);
