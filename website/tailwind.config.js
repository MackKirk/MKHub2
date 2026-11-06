/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        metals: {
          ink: '#121418',
          steel: '#2a3038',
          mist: '#e8eaed',
          paper: '#f4f5f7',
          accent: '#c45c26',
          accentDark: '#9a451c',
        },
      },
      fontFamily: {
        display: ['"Barlow Condensed"', 'ui-sans-serif', 'system-ui'],
        sans: ['"Source Sans 3"', 'ui-sans-serif', 'system-ui'],
      },
    },
  },
  plugins: [],
};
