/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#16314f',
        gold: '#d8a14a',
      },
    },
  },
  plugins: [],
};
