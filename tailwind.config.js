/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx,js}'],
  theme: {
    extend: {
      fontFamily: { sans: ['Cairo', 'system-ui', 'sans-serif'] },
      colors: {
        brand: {
          50: '#eef2ff', 100: '#e0e7ff', 500: '#6366f1', 600: '#4f46e5',
          700: '#4338ca', 800: '#3730a3', 900: '#312e81',
        },
      },
    },
  },
  plugins: [],
};
