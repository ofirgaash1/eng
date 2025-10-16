import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "#050505",
        foreground: "#f3f4f6",
        accent: {
          exact: "#10b981",
          variant: "#f97316",
        },
      },
    },
  },
  plugins: [],
};

export default config;
