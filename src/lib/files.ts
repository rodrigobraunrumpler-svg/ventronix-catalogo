export const PDF_MIME = 'application/pdf'
export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

// Los archivos llegan en base64 desde las Server Actions: el PDF de la proforma y los Excel.
export function base64ToFile(base64: string, fileName: string, type = PDF_MIME) {
  const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))
  return new File([bytes], fileName, { type })
}

// La dirección temporal se libera después, para no cortar la descarga ni la pestaña.
export const releaseObjectUrl = (url: string) => setTimeout(() => URL.revokeObjectURL(url), 60_000)

export function downloadFile(file: File) {
  const url = URL.createObjectURL(file)
  const link = document.createElement('a')
  link.href = url
  link.download = file.name
  document.body.append(link)
  link.click()
  link.remove()
  releaseObjectUrl(url)
}
