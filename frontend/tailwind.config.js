/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        space: {
          black: "#020408",
          surface: "rgba(255,255,255,0.03)",
          border: "rgba(255,255,255,0.08)",
        },
        cyan: {
          accent: "#00E5FF",
        },
        violet: {
          accent: "#9D00FF",
        },
        success: "#00FF88",
        danger: "#FF3366",
      },
      fontFamily: {
        sans: ["DM Sans", "sans-serif"],
        heading: ["Syne", "sans-serif"],
        mono: ["Space Mono", "monospace"],
      },
      animation: {
        "pulse-glow": "pulseGlow 2s ease-in-out infinite",
        "slide-in": "slideIn 0.3s ease",
        "count-up": "countUp 0.6s ease",
      },
      keyframes: {
        pulseGlow: {
          "0%, 100%": { boxShadow: "0 0 8px #00E5FF44" },
          "50%": { boxShadow: "0 0 24px #00E5FFaa" },
        },
        slideIn: {
          from: { opacity: "0", transform: "translateY(-8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      backdropBlur: {
        card: "12px",
      },
    },
  },
  plugins: [],
};
