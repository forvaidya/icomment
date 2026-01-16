/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./src/**/*.{tsx,ts}",
    "./public/**/*.html",
  ],
  theme: {
    extend: {
      colors: {
        brand: "#a855f7", // Guru purple
      },
      typography: {
        DEFAULT: {
          css: {
            color: "#333",
            a: {
              color: "#a855f7",
              "&:hover": {
                color: "#9945e6",
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
