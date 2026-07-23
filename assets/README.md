# Sekwencer 3D — Spatial Audio Lab

Warstwowy sekwencer trajektorii dźwięku w przestrzeni 3D (HRTF, Web Audio API).
Projektujesz tor ruchu źródła (okrąg, kwadrat, Lissajous, lemniskata, helix),
skalę, prędkość, obrót pola (pitch / yaw) i barwę, a aplikacja spatializuje dźwięk
w czasie rzeczywistym z podglądem radarowym (X/Z) i osią wysokości (Y). Część zestawu
narzędzi **Spatial Audio Lab**.

**Na żywo:** https://spatial-audio-lab.github.io/sekwencer/

## Funkcje
- Pięć kształtów trajektorii + regulacja prędkości, kierunku i skali.
- Obrót pola dźwiękowego (X/pitch, Y/yaw) i wybór kształtu fali (timbre).
- Podgląd radarowy trajektorii (ghost path) + wskaźnik wysokości i odczyt XYZ.
- Spatializacja HRTF przez `PannerNode` (Web Audio API).
- **Wymagane słuchawki** — dźwięk przestrzenny (binauralny).

## System wizualny
Zgodny z **SAL Design Manifest v3.0**: baza neutralna (#0A0C08 / #12150F / #F0EBE0),
akcenty semantyczne — **cyan #00E5CC** (kontrolki / nagłówki / playback / fokus),
**amber #FFAB00** (odczyt 3D: punkt dźwięku, wysokość, współrzędne, tytuł),
**crimson #FF3355** (stan nieaktywny / błąd). Kolor marki Huba (acid #BEFF00) występuje
wyłącznie w pigułce powrotu do Huba. Typografia: Lexend + Azeret Mono. Dostępność:
widoczny fokus cyan, `prefers-reduced-motion`, wartości suwaków zawsze widoczne.

## Technologia
Pojedynczy plik `index.html` (bez kroku budowania). Tailwind CSS + fonty Google z CDN.
Zasoby marki są lokalne — aplikacja jest samodzielna.

## Deploy (GitHub Pages)
Settings → Pages → Source: **Deploy from a branch** → `main` → `/ (root)`.
Plik `.nojekyll` zapewnia poprawne serwowanie katalogu `assets/`.

## Licencja
MIT — patrz [LICENSE](LICENSE).
