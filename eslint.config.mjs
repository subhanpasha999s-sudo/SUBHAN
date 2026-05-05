import nextConfig from "eslint-config-next";

/** Next 16 removed `next lint`; use ESLint 9 flat config. */
const config = [
  ...nextConfig,
  {
    rules: {
      /** Legitimate patterns (prop sync reset, dialogs, pagination clamp) flagged false-positive for React <19 code. */
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/purity": "off",
      /** Ref-sync for stable callbacks (protected actions) conflicts with Compiler rules until refactored. */
      "react-hooks/refs": "off",
      "react-hooks/incompatible-library": "off",
      "import/no-anonymous-default-export": "off",
    },
  },
];

export default config;
