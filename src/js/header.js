// Pasek marki SAL v3.1 — komponent nagłówka.
// Specyfikacja: claude/zasady-zgodnosci-z-manifestem.md sekcja 4a (projekt Claude,
// "Spójna strona SPATIAL AUDIO LAB"), źródło: SAL Brand System.dc.html (dostarczony
// przez Oskara 18.08.2026). Zastępuje poprzedni minimalny nagłówek tool-back + status
// tekstowy "Audio Context: Idle/Running".
//
// Decyzja Oskara 18.08: sama kropka statusu (z pulsem/pierścieniem gdy gra dźwięk)
// wystarczy — bez tekstowego odczytu w pasku. Przycisk ODTWÓRZ/WYCISZ w panelu
// transportu (ui.js) już niesie czytelny stan.

export function setHeaderPlaying(playing) {
  const dot = document.getElementById('salStatusDot')
  const bar = document.getElementById('salBar')
  if (!dot || !bar) return
  dot.classList.toggle('is-playing', !!playing)
  bar.classList.toggle('is-playing', !!playing)
}

// Zakładki po prawej / hamburger na mobile (≤380px, patrz src/styles/header.css).
// Zestaw i docelowe cele zakładek "Pomoc" / "O projekcie" czekają na decyzję Oskara
// (patrz claude/etap4-sekwencer-generator-trajektorii-plan.md, "Otwarte pytania") —
// na razie widoczne wg specyfikacji wizualnej, nieaktywne funkcjonalnie poza "Eksport"
// (przewija do sekcji nagrywania, która już istnieje w panelu).
export function wireHeader() {
  const burger = document.getElementById('salBurger')
  const mobileMenu = document.getElementById('salMobileMenu')
  if (burger && mobileMenu) {
    burger.addEventListener('click', () => {
      const open = mobileMenu.classList.toggle('is-open')
      burger.setAttribute('aria-expanded', open ? 'true' : 'false')
    })
  }
  document.querySelectorAll('[data-tab]').forEach((el) => {
    el.addEventListener('click', (e) => {
      if (el.getAttribute('aria-disabled') === 'true') {
        e.preventDefault()
        return
      }
      if (mobileMenu) mobileMenu.classList.remove('is-open')
      if (burger) burger.setAttribute('aria-expanded', 'false')
    })
  })
}
