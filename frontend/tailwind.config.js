/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          red: '#d11616',
          red700: '#a90f0f',
          black: '#0b0b0c',
          gold: '#d4af37'
        }
      },
      boxShadow: {
        hero: '0 30px 80px rgba(3,7,18,.25)',
      },
      fontFamily: {
        sans: ['Montserrat', 'ui-sans-serif', 'system-ui']
      },
      borderRadius: {
        xl: '14px'
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(-4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' }
        }
      },
      animation: {
        fadeIn: 'fadeIn 0.3s ease-out forwards'
      }
    }
  },
  plugins: [],
};


