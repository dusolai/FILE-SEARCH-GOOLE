/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "./*.{js,ts,jsx,tsx}" // <--- ¡NUEVA LÍNEA! Esto busca en la raíz (App.tsx, index.tsx)
  ],
  theme: {
    extend: {
      colors: {
        'gem-blue': '#4daafc',
        'gem-slate': '#1e293b',
        'gem-mist': '#94a3b8',
      },
    },
  },
  plugins: [],
}
