/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Nunito", "Quicksand", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        mono: ["SFMono-Regular", "Consolas", "Menlo", "monospace"]
      },
      colors: {
        blush: {
          50: "#FFF7F8",
          100: "#FFECEF",
          200: "#FFD9E0",
          300: "#FFB8C6",
          400: "#FF9EB2",
          500: "#F97F98",
          600: "#E85D7D"
        },
        cream: {
          50: "#FFFBF5",
          100: "#FFF6EB",
          200: "#FDEEDC"
        },
        lavender: {
          50: "#F7F5FF",
          100: "#EFEAFE",
          200: "#E2DAFC",
          300: "#C9B8F5",
          400: "#B294EE",
          500: "#9A79E6"
        },
        cocoa: {
          300: "#C4A8A0",
          400: "#A98D85",
          500: "#8A6F68",
          600: "#6E544E",
          700: "#573F3A"
        }
      },
      boxShadow: {
        plush: "0 10px 30px -12px rgba(190, 130, 150, 0.35)",
        plushlg: "0 24px 60px -20px rgba(190, 130, 150, 0.45)"
      },
      keyframes: {
        floaty: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-6px)" }
        }
      },
      animation: {
        floaty: "floaty 4s ease-in-out infinite"
      }
    }
  },
  plugins: []
};
