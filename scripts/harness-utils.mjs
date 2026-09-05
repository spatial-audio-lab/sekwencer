import fs from 'node:fs'

// Wykrywanie przegladarki: zmienna srodowiskowa, domyslny Chrome na Windowsie,
// linuksowa sciezka w srodowisku CI, lub uruchomienie przez channel: 'chrome'
// (na wypadek braku pobranej paczki ms-playwright).
export function getBrowserLaunchOptions() {
  if (process.env.SAL_CHROME) {
    return { executablePath: process.env.SAL_CHROME }
  }
  const defaultWin = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  if (fs.existsSync(defaultWin)) {
    return { executablePath: defaultWin }
  }
  const linux = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
  if (fs.existsSync(linux)) {
    return { executablePath: linux }
  }
  return { channel: 'chrome' }
}
