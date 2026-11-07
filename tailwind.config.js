/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#F7F6F3",
        ink: "#1B2A4A",
        action: "#B8862E",
        success: "#3F6B52",
        danger: "#B5533C",
        line: "#DCD8D0",
      },
      fontFamily: {
        sans: ["Inter", "sans-serif"],
      },
    },
  },
  plugins: [],
};
