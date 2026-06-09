/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        void: '#0A0A0F',
        'void-2': '#12121A',
        'void-3': '#1C1C28',
        'void-4': '#252535',
        bone: '#E8E6E0',
        'bone-2': '#B8B5AC',
        'bone-3': '#7A776E',
        amber: '#D4A017',
        'amber-dim': '#8A6710',
        'amber-glow': '#F0B820',
        green: '#2ECC71',
        red: '#E74C3C',
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      animation: {
        'pulse-amber': 'pulse-amber 1s ease-in-out infinite',
        'slide-up': 'slide-up 0.3s ease-out',
        'flash-green': 'flash-green 0.4s ease-out',
        'flash-red': 'flash-red 0.4s ease-out',
      },
      keyframes: {
        'pulse-amber': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.4' },
        },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'flash-green': {
          '0%': { backgroundColor: 'rgba(46,204,113,0.3)' },
          '100%': { backgroundColor: 'transparent' },
        },
        'flash-red': {
          '0%': { backgroundColor: 'rgba(231,76,60,0.3)' },
          '100%': { backgroundColor: 'transparent' },
        },
      },
    },
  },
  plugins: [],
}
