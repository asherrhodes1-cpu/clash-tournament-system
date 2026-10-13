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
        // The stream overlays' night blues in place of the grays every panel,
        // field and border is written in, so the whole site takes their look
        // the same way. `neutral` is used for the same things as `gray`.
        gray: { 950: '#050720', 900: '#080c28', 800: '#121945', 700: '#101746', 600: '#2a3780', 500: '#5a69ad' },
        neutral: { 900: '#080c28', 800: '#121945', 700: '#101746', 600: '#2a3780' },
      },
    },
  },
  plugins: [],
}
