# Sekwencer — Spatial Audio Lab

Generator trajektorii przestrzennych: ciągła, zautomatyzowana manipulacja pozycją źródła
dźwięku w przestrzeni 3D (HRTF, Web Audio API). Projektujesz tor ruchu źródła (okrąg,
kwadrat, Lissajous, lemniskata, helix), skalę, prędkość, obrót pola (pitch / yaw) i barwę,
a aplikacja spatializuje dźwięk w czasie rzeczywistym z podglądem radarowym (X/Z) i osią
wysokości (Y). Część zestawu narzędzi **Spatial Audio Lab**.

> Nazwa robocza. Krótka nazwa marki (analogicznie do Scena/Sfera) jeszcze nie ustalona —
> patrz `claude/etap4-sekwencer-generator-trajektorii-plan.md` w projekcie Claude.

**Na żywo:** https://spatial-audio-lab.github.io/sekwencer/

## Funkcje
- Pięć kształtów trajektorii + regulacja prędkości, kierunku i skali.
- Obrót pola dźwiękowego (X/pitch, Y/yaw) i wybór kształtu fali (timbre).
- Podgląd radarowy trajektorii (ghost path) + wskaźnik wysokości i odczyt XYZ.
- Spatializacja HRTF przez `PannerNode` (Web Audio API).
- Wczytanie własnego dźwięku w pętli (opus/mp3/wav/ogg/flac/m4a/aac).
- Nagrywanie do WAV 48 kHz / 32-bit float: binauralny (stereo) albo ambisoniczny
  FOA AmbiX (4 ścieżki, kodowanie ACN/SN3D).
- **Wymagane słuchawki** — dźwięk przestrzenny (binauralny).

## System wizualny
Zgodny z **SAL Design Manifest v3.0** + pasek marki **v3.1** (18.08.2026, patrz
`claude/zasady-zgodnosci-z-manifestem.md` sekcja 4a w projekcie Claude): baza neutralna
(#0A0C08 / #12150F / #F0EBE0), akcenty semantyczne — **cyan #00E5CC** (kontrolki / playback
/ fokus), **amber #FFAB00** (odczyt 3D: punkt dźwięku, wysokość, współrzędne),
**crimson #FF3355** (błąd/REC). Acid #BEFF00 występuje wyłącznie w pigułce marki SAL i
w aktywnej zakładce paska — nigdzie indziej w narzędziu. Typografia: Lexend + Azeret Mono.
Dostępność: widoczny fokus cyan, `prefers-reduced-motion`, wartości suwaków zawsze widoczne.

## Technologia — Etap 1 przebudowy (18.08.2026)
Projekt przeszedł z jednoplikowego `index.html` na **Vite** + moduły ES:

```
src/
  main.js            punkt wejścia — boot()
  styles/
    main.css          baza (przyciski, formularze, dostępność) + importy poniżej
    header.css         pasek marki SAL v3.1
    layout.css          #app flex layout (reszta: klasy Tailwind bezpośrednio w index.html)
  js/
    state.js          wspólny stan aplikacji
    math.js            trajektorie, rotacje, computePoint/omega
    audio.js            silnik WebAudio HRTF, render offline, enkoder WAV
    ui.js                wiring kontrolek, radar, nagrywanie
    header.js            pasek SAL v3.1 — kropka statusu, mobile menu
```

Tailwind CSS nadal z CDN (bez zmian z poprzedniej wersji — usunięcie CDN i przejście na
build-time Tailwind to możliwe usprawnienie na później, nie część Etapu 1). Logika audio/
matematyki/eksportu **nie zmieniła się** względem poprzedniej wersji — to czysta
modularyzacja + nowy pasek.

Kolejne etapy (osobne sesje, patrz `claude/etap4-sekwencer-generator-trajektorii-plan.md`):
Etap 2 — wizualizacja 3D (Three.js), Etap 3 — eksport Opus (FFmpeg WASM w Web Workerze),
Etap 4 — GitHub Actions.

### Rozwój lokalny
```
npm install
npm run dev       # serwer deweloperski z HMR
npm run build     # build produkcyjny do docs/
```

## Deploy (GitHub Pages) — tymczasowo ręczny, do czasu Etapu 4
Settings → Pages → Source: **Deploy from a branch** → `main` → **`/docs`**.

Bez GitHub Actions (Etap 4 jeszcze nie wdrożony) trzeba zbudować i zacommitować output
ręcznie przed każdą publikacją:

1. `npm run build` (produkuje `docs/`, nadpisuje poprzedni output).
2. Zacommitować `docs/` razem ze zmianami w `src/` — **jeden commit, oba na raz**, żeby
   opublikowany kod zawsze odpowiadał źródłu w `src/`.
3. Push. GitHub Pages serwuje zawartość `docs/` pod `/sekwencer/`.

`docs/.nojekyll` (kopiowany automatycznie z `public/.nojekyll` przy każdym buildzie)
zapewnia poprawne serwowanie katalogów zaczynających się od podkreślenia/kropki.

**Uwaga:** `docs/` jest commitowany celowo (nie w `.gitignore`) — to jedyny sposób publikacji
bez CI. Po wdrożeniu Etapu 4 output builda przestanie trafiać do repo (Actions zbuduje go
przy publikacji) i `vite.config.js` wróci na `outDir: 'dist'` (ignorowany w gicie).

## Weryfikacja
`scripts/verify.mjs` — harness Playwright: serwuje `docs/` pod `/sekwencer/` (układ
GitHub Pages), sprawdza konsolę, ładowanie obrazów, radar, przełącznik audio i eksport WAV
(binaural + AmbiX) przez przechwycenie `URL.createObjectURL`. `scripts/verify-render.mjs`
robi to samo wizualnie z lokalnie zbudowanym Tailwind (sandbox blokuje CDN — poza sandboksem
zbędne). Wymaga `npm install -D playwright tailwindcss@3` (nie w domyślnych zależnościach —
narzędzia deweloperskie, nie część aplikacji).

## Licencja
MIT — patrz [LICENSE](LICENSE).
