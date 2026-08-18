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
// "Eksport" przewija do sekcji nagrywania (href="#panelNagrywanie", bez JS). "Pomoc" i
// "O projekcie" otwierają modale (treść ustalona z Oskarem 18.08, patrz
// claude/etap4-sekwencer-generator-trajektorii-plan.md w projekcie Claude).
let lastFocusedTrigger = null

function openModal(modal, trigger) {
  if (!modal) return
  lastFocusedTrigger = trigger || document.activeElement
  modal.classList.add('is-open')
  modal.setAttribute('aria-hidden', 'false')
  const closeBtn = modal.querySelector('[data-close-modal]')
  if (closeBtn) closeBtn.focus()
}

function closeModal(modal) {
  if (!modal || !modal.classList.contains('is-open')) return
  modal.classList.remove('is-open')
  modal.setAttribute('aria-hidden', 'true')
  if (lastFocusedTrigger && typeof lastFocusedTrigger.focus === 'function') {
    lastFocusedTrigger.focus()
  }
}

function closeAllModals() {
  document.querySelectorAll('.sal-modal-overlay.is-open').forEach(closeModal)
}

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
      const modalId = el.getAttribute('data-modal')
      if (modalId) {
        e.preventDefault()
        openModal(document.getElementById(modalId), el)
      }
      if (mobileMenu) mobileMenu.classList.remove('is-open')
      if (burger) burger.setAttribute('aria-expanded', 'false')
    })
  })

  // Zamykanie: przycisk ✕, klik na overlay (poza kartą), Escape.
  document.querySelectorAll('.sal-modal-overlay').forEach((overlay) => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal(overlay)
    })
    overlay.querySelectorAll('[data-close-modal]').forEach((btn) => {
      btn.addEventListener('click', () => closeModal(overlay))
    })
  })
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeAllModals()
  })
}
