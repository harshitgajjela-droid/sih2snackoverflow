/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        page:        '#F4F6F9',
        panel:       '#FFFFFF',
        border:      '#DCE1E8',
        'border-mid':'#C4CBD6',

        navy:        '#14315C',
        'navy-mid':  '#6F8FBF',
        'navy-light':'#E8EEF7',

        approved:    '#15703F',
        pending:     '#9A5B00',
        rejected:    '#B3261E',
        focus:       '#1F5BD8',

        ink:         '#0E1A2B',
        secondary:   '#4A5668',
        tertiary:    '#6B7686',
      },
      fontFamily: {
        sans: ['IBM Plex Sans', 'system-ui', 'sans-serif'],
        mono: ['IBM Plex Mono', 'Courier New', 'monospace'],
      },
      fontSize: {
        meta:  ['12.5px', { lineHeight: '1.4' }],
        body:  ['14px',   { lineHeight: '1.5' }],
        title: ['15px',   { lineHeight: '1.4', fontWeight: '600' }],
        page:  ['24px',   { lineHeight: '1.3', fontWeight: '600' }],
        kpi:   ['32px',   { lineHeight: '1.1', fontWeight: '600' }],
      },
      fontWeight: { normal: '400', semibold: '600' },
      borderRadius: { DEFAULT: '6px', none: '0' },
      boxShadow: { none: 'none' },
    },
  },
  plugins: [],
}
