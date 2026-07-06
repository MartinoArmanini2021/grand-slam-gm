/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans Variable"', 'system-ui', 'sans-serif'],
        mono: ['"DM Mono"', 'ui-monospace', 'monospace'],
      },
      colors: {
        night: {
          DEFAULT: '#07090F',
          card: '#0C1019',
          raised: '#131824',
          hover: '#1A2234',
          active: '#1F2A3E',
        },
        ink: {
          DEFAULT: '#ECF0FA',
          2: '#5D6E8A',
          3: '#2D3A52',
        },
        volt:  '#3D8BFF',
        turf:  '#00C45A',
        ember: '#FF5722',
        gold:  '#FFAB00',
      },
      borderColor: {
        subtle: 'rgba(255,255,255,0.07)',
        bright: 'rgba(255,255,255,0.13)',
      },
    },
  },
  plugins: [],
}
