/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./src/**/*.{tsx,ts}",
    "./public/**/*.html",
  ],
  theme: {
    extend: {
      colors: {
        brand: "#ff0000", // BadTameez red
      },
      typography: {
        DEFAULT: {
          css: {
            color: "#333",
            a: {
              color: "#ff0000",
              "&:hover": {
                color: "#cc0000",
              },
            },
          },
        },
      },
      prefix: "icomment-",
    },
  },
  plugins: [
    require("@tailwindcss/typography"),
  ],
  darkMode: "class",
  corePlugins: {
    preflight: false,
  },
};
