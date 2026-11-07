/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#F3F5F4",
        ink: "#18201D",
        action: "#00A86B",
        brand: "#00A86B",
        success: "#16875F",
        danger: "#D04A3A",
        line: "rgba(24, 32, 29, 0.1)",
      },
      fontFamily: {
        sans: ["-apple-system", "BlinkMacSystemFont", "SF Pro Display", "Segoe UI", "sans-serif"],
      },
    },
  },
  plugins: [],
};
