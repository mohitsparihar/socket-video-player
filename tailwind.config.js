/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        cinema: {
          black: '#0a0a0a',
          dark: '#141414',
          panel: '#1a1a1a',
          border: '#2a2a2a',
          muted: '#737373',
          silver: '#a3a3a3',
        },
      },
    },
  },
  plugins: [],
}
