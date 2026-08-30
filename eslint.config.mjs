import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([".next/**", "out/**", "build/**", "dist/**", "vendor/**", "next-env.d.ts"]),
  {
    rules: {
      // `const { x: _x, ...rest } = value` is how this codebase drops a field.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", ignoreRestSiblings: true },
      ],
      // AutoParts is an independent application: AgentPay may only be reached
      // through the published SDK package and its public HTTP APIs.
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/hackatonyuno/**", "**/lib/agentpay-policy*", "**/sdk/index*"],
              message:
                "Import AgentPay behaviour from the @agentpay/merchant-sdk package, never from the AgentPay repository.",
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
