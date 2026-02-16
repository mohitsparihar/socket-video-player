/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        light: {
          bg: '#ffffff',
          surface: '#f8f9fa',
          panel: '#f1f3f5',
          border: '#dee2e6',
          text: '#212529',
          muted: '#6c757d',
          purple: {
            DEFAULT: '#7c3aed',
            hover: '#6d28d9',
            light: '#ede9fe',
          },
        },
      },
    },
  },
  plugins: [],
}
