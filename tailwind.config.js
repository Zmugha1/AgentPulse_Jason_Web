/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx,html}'],
  theme: {
    extend: {
      colors: {
        navy: '#2D4459',
        teal: '#3BBFBF',
        mint: '#C8E8E5',
        coral: '#F05F57',
        cream: '#FEFAF5',
        gold: '#D4A017',
        slate: '#5C6B7A',
      },
      fontFamily: {
        heading: ['Georgia', 'serif'],
        body: ['"Trebuchet MS"', 'Trebuchet', 'sans-serif'],
        label: ['"Courier New"', 'Courier', 'monospace'],
      },
    },
  },
  plugins: [],
}
