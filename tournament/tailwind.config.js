/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      // The site's accent used to be gold, written as amber/yellow classes all
      // over the app. Remapping those two palettes here turns the accent white
      // (a white-to-silver gradient on buttons and the title) without touching
      // each class - and reverting is just deleting this block. Only the shades
      // the app uses.
      colors: {
        amber: { 100: '#ffffff', 200: '#f5f5f5', 300: '#ffffff', 400: '#ffffff' },
        yellow: { 400: '#f5f5f5', 500: '#d4d4d4' },
      },
    },
  },
  plugins: [],
}
