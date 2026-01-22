/** @type {import('tailwindcss').Config} */
export default {
    content: [
      "./index.html",
      "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
      extend: {
        colors: {
          background: "#0f172a", // Slate 900
          surface:   "#1e293b",  // Slate 800
          primary:   "#38bdf8",  // Sky 400
          text:      "#e2e8f0",  // Slate 200
          muted:     "#64748b",  // Slate 500
        },
        animation: {
          'fade-in': 'fadeIn 0.5s ease-out',
          'fade-out': 'fadeOut 0.5s ease-in',
        },
        keyframes: {
          fadeIn: {
            '0%': { opacity: '0', transform: 'translateY(10px)' },
            '100%': { opacity: '1', transform: 'translateY(0)' },
          },
          fadeOut: {
            '0%': { opacity: '1' },
            '100%': { opacity: '0' },
          }
        }
      },
    },
    plugins: [],
  }