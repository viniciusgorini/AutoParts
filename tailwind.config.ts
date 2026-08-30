import type { Config } from "tailwindcss";

/**
 * Tailwind v3 is used deliberately: v4's engine ships as a native binary that
 * this build environment blocks. See README, "Build environment notes".
 */
const config: Config = {
  content: ["./src/app/**/*.{ts,tsx}", "./src/components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "Arial", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
