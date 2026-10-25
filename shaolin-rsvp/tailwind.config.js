/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./assets/js/**/*.js"],
  theme: {
    extend: {
      colors: {
        ink: "#0E0D0B",     // fondo
        panel: "#15130F",   // superficies (modal, campos)
        line: "#2E2A22",    // bordes finos
        bone: "#EFE8DA",    // texto principal
        mist: "#B9B3A6",    // texto secundario
        stone: "#8C867A",   // etiquetas
        gold: "#C5A059",    // acento
        "gold-ink": "#1A1407", // texto sobre dorado
        seal: "#B3261E",    // sello rojo 禅
        alert: "#E8A38E",   // errores
      },
      fontFamily: {
        display: ['"Marcellus"', '"Cormorant Garamond"', "Georgia", "serif"],
        sans: ['"Jost"', '"Avenir Next"', '"Century Gothic"', "system-ui", "sans-serif"],
        cjk: ['"Noto Serif SC"', '"Songti SC"', "STSong", "SimSun", "serif"],
      },
    },
  },
  plugins: [],
};
