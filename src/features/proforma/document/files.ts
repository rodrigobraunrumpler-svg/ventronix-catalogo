import { whatsappLink } from './format'

// El PDF llega en base64 desde la Server Action.
export function base64ToFile(base64: string, fileName: string) {
  const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))
  return new File([bytes], fileName, { type: 'application/pdf' })
}

// La dirección temporal se libera después, para no cortar la descarga ni la pestaña.
const release = (url: string) => setTimeout(() => URL.revokeObjectURL(url), 60_000)

export function downloadFile(file: File) {
  const url = URL.createObjectURL(file)
  const link = document.createElement('a')
  link.href = url
  link.download = file.name
  document.body.append(link)
  link.click()
  link.remove()
  release(url)
}

// Con una pestaña ya abierta (abierta al pulsar, para que el navegador no la bloquee) se usa esa.
export function openFile(file: File, tab?: Window | null) {
  const url = URL.createObjectURL(file)
  if (tab) tab.location.href = url
  else window.open(url, '_blank', 'noopener')
  release(url)
}

// Móvil: menú de compartir del teléfono con el PDF y el mensaje. PC (o si no se puede compartir):
// descarga el PDF y abre el chat del cliente en WhatsApp (spec del documento §7).
export async function shareOnWhatsApp(file: File, message: string, phone: string) {
  const touch = window.matchMedia?.('(pointer: coarse)').matches
  if (touch && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text: message })
      return
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
    }
  }
  downloadFile(file)
  window.open(whatsappLink(phone, message), '_blank', 'noopener')
}
