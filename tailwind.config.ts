import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        forest: {
          DEFAULT: "#0A2514",
          50: "#E8F0EB",
          100: "#C6D9CC",
          200: "#8DB89A",
          300: "#4D8A5E",
          400: "#1E5C35",
          500: "#0A2514",
          600: "#081E10",
          700: "#05150B",
          800: "#030D07",
          900: "#010603",
        },
        lime: {
          DEFAULT: "#CBF653",
          50: "#F5FEE6",
          100: "#EAFCC9",
          200: "#DCF99E",
          300: "#CBF653",
          400: "#B3E030",
          500: "#8FBA1F",
          600: "#6B8C17",
          700: "#475E0F",
          800: "#273407",
          900: "#141B04",
        },
        cream: {
          DEFAULT: "#F4F1EA",
          50: "#FDFCFA",
          100: "#F4F1EA",
          200: "#E8E2D5",
          300: "#D5CAB8",
          400: "#BFB09A",
          500: "#A69278",
        },
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "monospace"],
        display: ["var(--font-display)", "serif"],
      },
      borderRadius: {
        "4xl": "2rem",
      },
    },
  },
  plugins: [],
};

export default config;
