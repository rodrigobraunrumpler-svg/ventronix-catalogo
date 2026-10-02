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

// Abre el PDF en una pestaña: la abierta al pulsar (después el navegador ya no deja abrirla) o una
// nueva. Si el navegador bloquea las pestañas, lo descarga; devuelve si se abrió.
export function openFile(file: File, tab = newTab()) {
  if (!tab) {
    downloadFile(file)
    return false
  }
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
