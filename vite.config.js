import { defineConfig } from 'vite'

// SAL / Spatial Audio Lab — Sekwencer (Generator Trajektorii Przestrzennych)
// Repo publikowany jako projekt GitHub Pages pod /sekwencer/ (patrz
// claude/etap4-sekwencer-generator-trajektorii-plan.md w projekcie Claude).
//
// outDir: 'docs' — TYMCZASOWE rozwiązanie do czasu Etapu 4 (GitHub Actions).
// Bez CI trzeba commitować zbudowany output; "Deploy from branch" w Ustawieniach
// GitHub Pages wspiera tylko `/ (root)` albo `/docs`, nie dowolny `/dist` — stąd
// ta nazwa, nie dlatego że to dokumentacja. Po wdrożeniu Etapu 4 (build w Actions,
// bez commitowania outputu) można wrócić do 'dist' i dopisać 'dist/' do .gitignore.
export default defineConfig({
  base: '/sekwencer/',
  build: {
    outDir: 'docs',
    assetsDir: 'app-assets', // nie 'assets' — kolizja z public/assets/brand (wspólne z Hubem)
  },
})
