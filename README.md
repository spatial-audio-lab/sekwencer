![Zestawienie logotypów KPO, RP i UE](https://raw.githubusercontent.com/spatial-audio-lab/spatial-audio-lab.github.io/main/KPO.jpg)

# Orbita — Spatial Audio Lab

Generator trajektorii przestrzennych: ciągła, zautomatyzowana manipulacja pozycją źródła
dźwięku w przestrzeni 3D (HRTF, Web Audio API). Projektujesz tor ruchu źródła (okrąg,
kwadrat, Lissajous, lemniskata, helix), skalę, prędkość, obrót pola (pitch / yaw) i barwę,
a aplikacja spatializuje dźwięk w czasie rzeczywistym w scenie 3D (Three.js, kamera
swobodna). Część zestawu narzędzi **Spatial Audio Lab**.

> Nazwa repo (`sekwencer`) jest historyczna — aplikacja nazywa się **Orbita** (ustalone
> 18.08.2026, analogicznie do Scena/Sfera). Patrz
> `claude/etap4-sekwencer-generator-trajektorii-plan.md` w projekcie Claude.

**Na żywo:** https://spatial-audio-lab.github.io/sekwencer/

## Funkcje
- Pięć kształtów trajektorii + regulacja prędkości, kierunku i skali.
- Obrót pola dźwiękowego (X/pitch, Y/yaw) i wybór kształtu fali (timbre).
- Wizualizacja 3D (Three.js + OrbitControls): siatka odniesienia, trajektoria jako linia
  przerywana, źródło jako świecąca sfera, kamera lata swobodnie (przeciągnij/scroll).
  Odczyt współrzędnych XYZ w HUD.
- Spatializacja HRTF przez `PannerNode` (Web Audio API) — ta sama pozycja karmi jednocześnie
  panner i wizualizację (jedna implementacja, patrz `src/js/scene3d.js`).
- Wczytanie własnego dźwięku w pętli (opus/mp3/wav/ogg/flac/m4a/aac).
- Nagrywanie do WAV 48 kHz / 32-bit float: binauralny (stereo) albo ambisoniczny
  FOA AmbiX (4 ścieżki, kodowanie ACN/SN3D).
- **Wymagane słuchawki** — dźwięk przestrzenny (binauralny).

## System wizualny
Zgodny z **SAL Design Manifest v3.0** + pasek marki **v3.1** (18.08.2026, patrz
`claude/zasady-zgodnosci-z-manifestem.md` sekcja 4a w projekcie Claude): baza neutralna
(#0A0C08 / #12150F / #F0EBE0), akcenty semantyczne — **cyan #00E5CC** (kontrolki / playback
/ fokus), **amber #FFAB00** (siatka, trajektoria, źródło, odczyt XYZ — spójne z konwencją
„amber = ambisonia / tryb 3D / pozycja" używaną też w Sferze), **crimson #FF3355**
(błąd/REC). Acid #BEFF00 występuje wyłącznie w pigułce marki SAL i w aktywnej zakładce
paska — nigdzie indziej w narzędziu. Typografia: Lexend + Azeret Mono. Dostępność: widoczny
fokus cyan, `prefers-reduced-motion`, wartości suwaków zawsze widoczne.

Wizualizacja 3D **świadomie innym silnikiem niż Sfera** (Sfera: własna matematyka na canvas
2D, model egocentryczny, bez Three.js; Orbita: prawdziwy Three.js + OrbitControls, kamera
swobodna) — spójność jest na poziomie języka wizualnego (kolory, typografia etykiet), nie
kodu. Uzasadnienie: `claude/etap4-sekwencer-generator-trajektorii-plan.md` w projekcie Claude.

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
    ui.js                wiring kontrolek, pętla update(), nagrywanie
    header.js            pasek SAL v3.1 — kropka statusu, mobile menu
    scene3d.js            wizualizacja 3D (Three.js) — Etap 2
```

Tailwind CSS nadal z CDN (bez zmian z poprzedniej wersji — usunięcie CDN i przejście na
build-time Tailwind to możliwe usprawnienie na później, nie część Etapu 1/2). Logika audio/
matematyki/eksportu **nie zmieniła się** względem poprzedniej wersji — to czysta
modularyzacja + nowy pasek.

## Technologia — Etap 2 przebudowy (18.08.2026)
Radar canvas 2D + suwak wysokości zastąpione sceną **Three.js**: `GridHelper` (siatka
odniesienia), `OrbitControls` (swobodna kamera), trajektoria jako `Line` przerywana,
źródło jako świecąca sfera + sprite-halo. Cała logika w `src/js/scene3d.js`.

`sourceMesh.position` w scenie 3D i `PannerNode` audio są karmione **tą samą wartością**
`state.pos` w jednej pętli (`ui.js#update()`) — nie dwiema niezależnymi implementacjami tej
samej pozycji. To świadome zabezpieczenie przed klasą błędu, która dotknęła Sferę (dwie
osobne implementacje tej samej rotacji rozjechały się cicho na wiele tygodni, patrz
`claude/etap3-ambi-player-v9-zgodnosc-kuli-i-dzwieku.md` w projekcie Claude) — zweryfikowane
też liczbowo w `scripts/verify-scene3d.mjs` (pozycja mesha vs. odczyt HUD, tolerancja 0.02 m).

Kolejne etapy (osobne sesje, patrz `claude/etap4-sekwencer-generator-trajektorii-plan.md`):
Etap 3 — eksport Opus (FFmpeg WASM w Web Workerze), Etap 4 — GitHub Actions.

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
GitHub Pages), sprawdza konsolę, ładowanie obrazów, przełącznik audio i eksport WAV
(binaural + AmbiX) przez przechwycenie `URL.createObjectURL`. `scripts/verify-render.mjs`
robi to samo wizualnie z lokalnie zbudowanym Tailwind (sandbox blokuje CDN — poza sandboksem
zbędne). `scripts/verify-scene3d.mjs` (Etap 2) sprawdza scenę 3D: canvas WebGL, zgodność
liczbowa pozycji sfery z pozycją karmiącą panner audio, realną reakcję `OrbitControls` na
przeciągnięcie (pozycja kamery), przebudowę geometrii trajektorii przy zmianie kształtu,
resize. **Wymaga renderu z lokalnie zbudowanym Tailwind** (patrz `scripts/render/` w
`verify-render.mjs`) — z samym CDN (zablokowanym w sandboksie) layout grid się rozjeżdża
i testy interakcji (np. przeciąganie kamery) dają fałszywy wynik. Wymaga
`npm install -D playwright tailwindcss@3` (nie w domyślnych zależnościach — narzędzia
deweloperskie, nie część aplikacji).


---


# O projekcie

[![Baner SAL](https://raw.githubusercontent.com/spatial-audio-lab/spatial-audio-lab.github.io/main/assets/brand/SAL_logo-wordmark.png)](https://spatial-audio-lab.github.io/)

## Spatial Audio Lab: archiwum VR dla edukacji teatralnej
„Spatial Audio Lab” to projekt stypendialny skupiony na tworzeniu profesjonalnego archiwum dźwięku przestrzennego. W ramach działań powstaje baza nagrań w technologii Virtual Reality (VR), która łączy nowoczesną inżynierię dźwięku z edukacją teatralną i technikami uważności (mindfulness).

[https://spatial-audio-lab.github.io/](https://spatial-audio-lab.github.io/)

---

## Finansowanie

![Zestawienie logotypów KPO, RP i UE](https://raw.githubusercontent.com/spatial-audio-lab/spatial-audio-lab.github.io/main/KPO.jpg)

## Informacja o finansowaniu

Projekt jest realizowany w ramach programu stypendialnego Krajowego Planu Odbudowy i Zwiększania Odporności (KPO).

- **Program:** Inwestycja A2.5.1: Program wspierania działalności podmiotów sektora kultury i przemysłów kreatywnych na rzecz stymulowania ich rozwoju.
- **Instytucja Wspierająca:** Narodowy Instytut Muzyki i Tańca (NIMiT).
- **Wartość dofinansowania z Unii Europejskiej (NextGenerationEU):** 36 000,00 zł brutto.
- Umowa nr **143/KPO.STYPENDIA/NIMIT/2025**.

## Licencja
MIT — patrz [LICENSE](LICENSE).
