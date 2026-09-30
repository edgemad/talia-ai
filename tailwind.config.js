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
        // Theme-aware: these follow the active liquid-glass theme
        ink: "var(--text)",
        "ink-soft": "var(--text-soft)",
        "ink-faint": "var(--text-faint)",
        accent: "var(--accent)",
        "accent-2": "var(--accent-2)",
        accentg: "var(--accent-grad)",
        ok: "var(--ok)",
        warn: "var(--warn)",
        info: "var(--info)",
        glassline: "var(--border)",
        // kept for compatibility with older components (mapped to vars where sensible)
        blush: {
          50: "rgba(255,247,248,0.9)",
          100: "var(--surface)",
          200: "var(--border)",
          300: "var(--accent)",
          400: "var(--accent)",
          500: "var(--accent)",
          600: "var(--accent)"
        },
        lavender: {
          50: "rgba(247,245,255,0.9)",
          100: "var(--surface)",
          200: "var(--border)",
          300: "var(--accent-2)",
          400: "var(--accent-2)",
          500: "var(--accent-2)",
          600: "var(--accent-2)"
        },
        cocoa: {
          300: "var(--text-faint)",
          400: "var(--text-faint)",
          500: "var(--text-soft)",
          600: "var(--text)",
          700: "var(--text)"
        },
        cream: {
          50: "var(--surface-strong)",
          100: "var(--bg)",
          200: "var(--surface)"
        }
      },
      boxShadow: {
        plush: "0 8px 30px -12px var(--glow)",
        plushlg: "0 20px 55px -18px var(--glow)"
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
