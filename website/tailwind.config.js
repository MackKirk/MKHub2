/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        metals: {
          ink: '#1c1e22',
          steel: '#2a2d31',
          mist: '#e4e6e9',
          paper: '#f0f1f3',
          accent: '#d11616',
          accentDark: '#a90f0f',
          gold: '#d4af37',
        },
      },
      fontFamily: {
        display: ['Montserrat', 'ui-sans-serif', 'system-ui'],
        sans: ['"Open Sans"', 'ui-sans-serif', 'system-ui'],
      },
      borderRadius: {
        sm: '2px',
      },
      keyframes: {
        mkFadeUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        mkFadeUp: 'mkFadeUp 0.45s ease-out forwards',
      },
    },
  },
  plugins: [],
};
