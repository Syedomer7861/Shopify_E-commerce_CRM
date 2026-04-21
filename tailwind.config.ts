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
          DEFAULT: "#2D1E6F",
          50: "#EEF0FF",
          100: "#E0E4FF",
          200: "#C1C8FF",
          300: "#A2ADFF",
          400: "#8391FF",
          500: "#2D1E6F",
          600: "#25195C",
          700: "#1D1449",
          800: "#150F36",
          900: "#0D0A23",
        },
        lime: {
          DEFAULT: "#2D1E6F",
          50: "#F9FAFB",
          100: "#F3F4F6",
          200: "#E5E7EB",
          300: "#D1D5DB",
          400: "#9CA3AF",
          500: "#6B7280",
          600: "#4B5563",
          700: "#374151",
          800: "#1F2937",
          900: "#111827",
        },
        cream: {
          DEFAULT: "#F8F9FA",
          50: "#FFFFFF",
          100: "#F8F9FA",
          200: "#E9ECEF",
          300: "#DEE2E6",
          400: "#CED4DA",
          500: "#ADB5BD",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        display: ["Inter", "system-ui", "sans-serif"],
      },

      borderRadius: {
        "4xl": "2rem",
      },
    },
  },
  plugins: [],
};

export default config;
