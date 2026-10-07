import { downloadFile, releaseObjectUrl } from '@/lib/files'
import { whatsappLink } from './format'

export { base64ToFile, downloadFile } from '@/lib/files'

export const TAB_BLOCKED = 'Tu navegador bloqueó la pestaña nueva: descargamos el PDF.'

// Pestaña nueva sin acceso a esta, como «noopener» (que no devuelve la pestaña). null si el
// navegador la bloquea.
export function newTab(url = '') {
  const tab = window.open(url, '_blank')
  if (tab) tab.opener = null
  return tab
}

// Si el PDF tarda más que esto, la pestaña de carga lo dice.
export const SLOW_MS = 10_000

// Negra como la cabecera del PDF: el logotipo sobre negro puro se funde con ella.
const LOADING_STYLE = `
  body { margin: 0; min-height: 100vh; display: grid; place-content: center; justify-items: center;
    gap: 20px; padding: 24px; box-sizing: border-box; background: #000; color: #e8ece4;
    font: 15px/1.5 system-ui, sans-serif; text-align: center; }
  img { width: min(260px, 70vw); }
  p { margin: 0; }
  .bar { width: 180px; height: 4px; border-radius: 4px; background: #23301a; overflow: hidden; }
  .bar::after { content: ''; display: block; width: 40%; height: 100%; border-radius: 4px;
    background: #72ce0b; animation: slide 1.1s ease-in-out infinite; }
  @keyframes slide { from { transform: translateX(-100%); } to { transform: translateX(250%); } }
  @media (prefers-reduced-motion: reduce) { .bar::after { width: 100%; animation: none; } }
  .slow { min-height: 1.5em; color: #9aa394; font-size: 13px; }
`

// Pestaña para un PDF que todavía se prepara: se abre al pulsar (si no, el navegador la bloquea) y
// muestra la carga con el logo hasta que llega el PDF. null si el navegador la bloquea.
export function pdfTab(title: string, message: string) {
  const tab = newTab()
  if (!tab) return null
  try {
    const page = tab.document
    page.title = title
    page.documentElement.lang = 'es'
    const icon = page.createElement('link')
    icon.rel = 'icon'
    icon.href = new URL('/favicon.ico', location.origin).href
    const style = page.createElement('style')
    style.textContent = LOADING_STYLE
    page.head.append(icon, style)
    const logo = page.createElement('img')
    logo.src = new URL('/brand/ventronix-logo-proforma.jpg', location.origin).href
    logo.alt = 'Ventronix'
    const bar = page.createElement('div')
    bar.className = 'bar'
    bar.setAttribute('aria-hidden', 'true')
    const status = page.createElement('p')
    status.setAttribute('role', 'status')
    status.textContent = message
    const slow = page.createElement('p')
    slow.className = 'slow'
    slow.setAttribute('aria-live', 'polite')
    page.body.replaceChildren(logo, bar, status, slow)
    // Si ya llegó el PDF, esto cambia la página de carga que quedó atrás: no se ve.
    setTimeout(() => {
      slow.textContent = 'Está tardando más de lo normal…'
    }, SLOW_MS)
  } catch {
    // Sin acceso a la pestaña: queda en blanco hasta que llegue el PDF, como antes.
  }
  return tab
}

// Abre el PDF en una pestaña: la abierta al pulsar (después el navegador ya no deja abrirla) o una
// nueva. Si el navegador bloquea las pestañas, lo descarga; devuelve si se abrió.
export function openFile(file: File, tab = newTab()) {
  if (!tab) {
    downloadFile(file)
    return false
  }
  // La persona cerró la pestaña de carga: no se abre otra.
  if (tab.closed) return true
  const url = URL.createObjectURL(file)
  tab.location.href = url
  releaseObjectUrl(url)
  return true
}

// Móvil: menú de compartir del teléfono con el PDF y el mensaje. PC (o si no se puede compartir):
// descarga el PDF y abre el chat del cliente en WhatsApp (spec del documento §7). Devuelve false si
// el navegador bloqueó la pestaña del chat.
export async function shareOnWhatsApp(file: File, message: string, phone: string) {
  const touch = window.matchMedia?.('(pointer: coarse)').matches
  if (touch && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text: message })
      return true
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return true
    }
  }
  downloadFile(file)
  return newTab(whatsappLink(phone, message)) !== null
}
