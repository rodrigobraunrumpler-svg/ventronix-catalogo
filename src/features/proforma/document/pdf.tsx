import 'server-only'
import path from 'node:path'
import type { ComponentProps } from 'react'
import {
  Document,
  Font,
  Image,
  Page,
  renderToBuffer,
  StyleSheet,
  Text,
  View,
} from '@react-pdf/renderer'
import { flowPieces, wrapCode } from './format'
import type { DocumentModel } from './model'

const fonts = path.join(process.cwd(), 'src/features/proforma/document/fonts')
// Logotipo de la proforma: fondo negro puro, se funde con la franja negra de la cabecera.
const logo = path.join(process.cwd(), 'public/brand/ventronix-logo-proforma.jpg')
// Franja de marcas que vende la empresa (fotocopiadoras, impresoras, computadoras…).
const brands = path.join(process.cwd(), 'public/brand/marcas.jpg')

Font.register({
  family: 'Jakarta',
  fonts: [400, 600, 700, 800].map((fontWeight) => ({
    src: path.join(fonts, `PlusJakartaSans-${fontWeight}.ttf`),
    fontWeight,
  })),
})
Font.register({
  family: 'JetBrainsMono',
  fonts: [400, 700].map((fontWeight) => ({
    src: path.join(fonts, `JetBrainsMono-${fontWeight}.ttf`),
    fontWeight,
  })),
})
// Las palabras no se cortan con guion: las descripciones se parten entre palabras.
Font.registerHyphenationCallback((word) => [word])

// Colores y medidas de la pizarra «Proforma · Documento A4» (1 px = 0,75 pt).
const color = {
  ink: '#121511',
  text: '#2a3027',
  muted: '#5d6559',
  line: '#e3e7de',
  lime: '#72ce0b',
  soft: '#d6dbd2',
}
const SIDE = 30
// Margen superior de las páginas siguientes; la franja negra de la primera lo cubre con un margen
// negativo para quedar pegada al borde, como en la pizarra.
const TOP = 24

// Medidas de la pizarra «Proforma · Documento A4». Con «compact» (muchos productos que no caben en
// una hoja) todo se aprieta: filas de una línea, cabecera y cliente más bajos, y términos y cuentas
// junto a los totales.
function sheet(compact: boolean) {
  const pick = (normal: number, tight: number) => (compact ? tight : normal)
  return StyleSheet.create({
    page: {
      fontFamily: 'Jakarta',
      fontSize: pick(9.75, 8.25),
      color: color.ink,
      lineHeight: pick(1.5, 1.4),
      // Sin alternativas contextuales: Jakarta cambia «1-2» por un signo menos y «1x2» por «×» (al
      // copiar del PDF salen así), y las ligaduras de JetBrains Mono («--», «->», «..») rompen fontkit.
      fontFeatureSettings: { calt: false },
      paddingTop: TOP,
      paddingBottom: 40,
    },
    watermark: {
      position: 'absolute',
      top: 360,
      left: -30,
      width: 655,
      height: 120,
      textAlign: 'center',
      fontSize: 96,
      fontWeight: 800,
      color: color.lime,
      opacity: 0.12,
      transform: 'rotate(-30deg)',
    },
    header: {
      marginTop: -TOP,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: '#000000',
      paddingVertical: pick(19.5, 9),
      paddingHorizontal: SIDE,
    },
    logo: { width: pick(165, 112) },
    headerRight: { alignItems: 'flex-end' },
    // react-pdf monta «PROFORMA» y el número con interlineado 1.5: se dibujan a 1.2 y el resto del
    // interlineado de la pizarra va en márgenes (más su gap de 2 px), para que las líneas caigan igual.
    headerTitle: {
      marginVertical: pick(2.9, 1.2),
      color: '#ffffff',
      fontSize: pick(19.5, 15),
      fontWeight: 800,
      letterSpacing: pick(1.56, 1.2),
      lineHeight: 1.2,
    },
    headerNumber: {
      marginTop: pick(3.5, 1.5),
      marginBottom: pick(2, 1),
      color: color.lime,
      fontFamily: 'JetBrainsMono',
      fontSize: pick(13.5, 11),
      fontWeight: 700,
      lineHeight: 1.2,
    },
    headerDate: { marginTop: pick(1.5, 0.5), color: color.soft, fontSize: pick(9, 7.5) },
    headerDateFirst: { marginTop: pick(6, 3) },
    companyRow: {
      flexDirection: 'row',
      paddingVertical: pick(10.5, 6),
      paddingHorizontal: SIDE,
      borderBottomWidth: 0.75,
      borderBottomColor: color.line,
    },
    companyItem: { flex: 1, paddingRight: 9 },
    label: { fontSize: pick(8.25, 7), color: color.muted },
    semibold: { fontWeight: 600 },
    client: {
      marginTop: pick(15, 8),
      marginHorizontal: SIDE,
      paddingTop: pick(12, 6),
      paddingBottom: pick(4.5, 2),
      paddingHorizontal: pick(13.5, 10),
      borderWidth: 0.75,
      borderColor: color.line,
      borderRadius: 7.5,
      flexDirection: 'row',
      flexWrap: 'wrap',
    },
    // Normal: dos columnas, como la pizarra. Compacta: tres por fila.
    clientLeft: { width: '60%', paddingRight: 18, marginBottom: 7.5 },
    clientRight: { width: '40%', marginBottom: 7.5 },
    clientCell: { width: '33.33%', paddingRight: 9, marginBottom: 4 },
    clientValue: { fontSize: pick(10.5, 8.75) },
    table: { marginTop: pick(15, 8), marginHorizontal: SIDE },
    thead: { flexDirection: 'row', backgroundColor: '#000000' },
    th: {
      color: '#ffffff',
      fontSize: pick(8.25, 7),
      fontWeight: 700,
      letterSpacing: 0.5,
      paddingVertical: pick(6.75, 4),
      paddingHorizontal: 7.5,
    },
    row: { flexDirection: 'row', borderBottomWidth: 0.75, borderBottomColor: color.line },
    td: { paddingVertical: pick(8.25, 3.5), paddingHorizontal: 7.5 },
    quantity: { width: 42 },
    // Columna «FOTO» (spec de productos libres §4.5): unos 1,5 cm, con la foto entera, sin recortar.
    photo: { width: pick(46, 34), paddingHorizontal: 4 },
    photoImage: {
      width: pick(38, 26),
      height: pick(38, 26),
      objectFit: 'contain',
      backgroundColor: '#f1f3ee',
      borderRadius: 3,
    },
    photoNote: { marginTop: pick(4, 2), fontSize: pick(8, 7), color: color.muted },
    code: { width: pick(64.5, 74) },
    mono: { fontFamily: 'JetBrainsMono', fontSize: pick(9, 7.5) },
    description: { flex: 1 },
    // react-pdf lee maxLines del estilo: lo que no cabe en la línea termina en «…».
    oneLine: { maxLines: 1, textOverflow: 'ellipsis' },
    unit: { width: pick(78, 70), textAlign: 'right' },
    lineTotal: { width: pick(84, 76), textAlign: 'right' },
    detail: { fontSize: pick(9, 7.5), color: color.muted },
    totals: {
      marginTop: pick(13.5, 8),
      marginHorizontal: SIDE,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-end',
    },
    totalsBox: { width: pick(225, 205) },
    totalsRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: pick(4.5, 2),
    },
    totalsLabel: { color: color.text },
    totalBand: {
      marginTop: pick(3, 2),
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: '#000000',
      borderRadius: 6,
      paddingVertical: pick(7.5, 5),
      paddingHorizontal: pick(9, 8),
    },
    totalLabel: {
      color: '#ffffff',
      fontSize: pick(10.5, 9),
      fontWeight: 700,
      letterSpacing: 0.42,
    },
    totalValue: { color: color.lime, fontSize: pick(13.5, 11.5), fontWeight: 800 },
    taxNote: {
      marginTop: pick(6, 3),
      fontSize: pick(8.25, 7),
      color: color.muted,
      textAlign: 'right',
    },
    // A la izquierda de los totales, en el hueco que dejan libre: la franja de marcas arriba y el
    // importe en letras abajo (en la compacta, también términos y cuentas). Así la imagen no alarga
    // la proforma ni la pasa a otra página.
    totalsLeft: {
      flex: 1,
      alignSelf: 'stretch',
      justifyContent: 'space-between',
      paddingRight: pick(18, 14),
    },
    brands: compact ? { width: 210, marginBottom: 5 } : { width: '100%', marginBottom: 9 },
    words: {
      paddingBottom: pick(3, 1),
      fontSize: pick(8.25, 7.25),
      fontWeight: 600,
      color: color.text,
    },
    bottom: {
      marginTop: 19.5,
      marginHorizontal: SIDE,
      paddingTop: 13.5,
      borderTopWidth: 0.75,
      borderTopColor: color.line,
      flexDirection: 'row',
    },
    inlineBottom: { flexDirection: 'row', marginBottom: 5 },
    terms: { flex: 1.3, paddingRight: pick(18, 10) },
    payments: { flex: 1 },
    heading: { fontSize: pick(9.75, 8), fontWeight: 700, marginBottom: pick(6, 2.5) },
    item: { fontSize: pick(9, 7.25), color: color.text, marginBottom: pick(2.25, 0.75) },
    // Lista numerada con sangría francesa, como el <ol> de la pizarra (18 px).
    term: { flexDirection: 'row' },
    termNumber: { width: pick(11.25, 9), marginRight: pick(2.25, 1.5), textAlign: 'right' },
    termText: { flex: 1 },
    // Los textos que dependen de la página van dentro de un contenedor fijo: react-pdf 4.9 no dibuja
    // un texto dinámico (render) que sea él mismo absoluto.
    footer: { position: 'absolute', bottom: 15, left: SIDE, right: SIDE, height: 16 },
    thanks: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      textAlign: 'center',
      fontSize: pick(9.75, 8.25),
      fontWeight: 600,
      color: color.text,
    },
    pageNumber: {
      position: 'absolute',
      top: 2,
      right: 0,
      textAlign: 'right',
      fontSize: 8.25,
      color: color.muted,
    },
    limeBar: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      height: 6,
      backgroundColor: color.lime,
    },
  })
}

const sheets = { normal: sheet(false), compact: sheet(true) }
type Sheet = (typeof sheets)['normal']
// Caracteres de JetBrains Mono (0,6 em) que caben en la columna CÓDIGO: (ancho − 15) / (letra × 0,6).
const codeChars = (compact: boolean) => (compact ? 13 : 9)
const NO_PHOTOS = new Map<string, Buffer>()

type TextStyle = ComponentProps<typeof View>['style']
const flow = { flexDirection: 'row', flexWrap: 'wrap' } as const

// Texto escrito por el usuario. Si trae una palabra más larga que su columna (ver flowPieces), sus
// trozos van en filas que saltan de línea; la caja ocupa el lugar del texto y le pasa su estilo.
function Words({ children, style }: { children: string; style?: TextStyle }) {
  const paragraphs = flowPieces(children)
  if (!paragraphs) return <Text style={style}>{children}</Text>
  return (
    <View style={style}>
      {paragraphs.map((pieces, index) => (
        <View key={index} style={flow}>
          {pieces.map((piece, key) => (
            <Text key={key}>{piece}</Text>
          ))}
        </View>
      ))}
    </View>
  )
}

function TableHead({ s, photos }: { s: Sheet; photos: boolean }) {
  return (
    <View fixed style={s.thead}>
      {photos ? <Text style={[s.th, s.photo]}>FOTO</Text> : null}
      <Text style={[s.th, s.quantity]}>CANT.</Text>
      <Text style={[s.th, s.code]}>CÓDIGO</Text>
      <Text style={[s.th, s.description]}>DESCRIPCIÓN</Text>
      <Text style={[s.th, s.unit]}>P. UNIT.</Text>
      <Text style={[s.th, s.lineTotal]}>TOTAL</Text>
    </View>
  )
}

function Terms({ s, terms }: { s: Sheet; terms: string[] }) {
  return (
    <View style={s.terms}>
      <Text style={s.heading}>Términos y condiciones</Text>
      {terms.map((term, index) => (
        <View key={index} style={s.term}>
          <Text style={[s.item, s.termNumber]}>{index + 1}.</Text>
          <Words style={[s.item, s.termText]}>{term}</Words>
        </View>
      ))}
    </View>
  )
}

function Payments({ s, payments }: { s: Sheet; payments: string[] }) {
  if (payments.length === 0) return null
  return (
    <View style={s.payments}>
      <Text style={s.heading}>Cuentas para el pago</Text>
      {payments.map((line, index) => (
        <Words key={index} style={s.item}>
          {line}
        </Words>
      ))}
    </View>
  )
}

// Plantilla A4 de la proforma, igual a la pizarra del prototipo (spec del documento §4). «compact»
// es la misma proforma apretada para que muchos productos quepan en una hoja.
export function ProformaPdf({
  model,
  images = NO_PHOTOS,
  compact = false,
}: {
  model: DocumentModel
  // Las fotos de la columna «FOTO», por ruta (loadPhotos).
  images?: Map<string, Buffer>
  compact?: boolean
}) {
  const s = compact ? sheets.compact : sheets.normal
  return (
    <Document title={model.title} author={model.author} language="es">
      <Page size="A4" style={s.page}>
        {model.draft ? (
          <Text fixed style={s.watermark}>
            BORRADOR
          </Text>
        ) : null}

        <View style={s.header}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- Image de react-pdf, no es un <img> */}
          <Image src={logo} style={s.logo} />
          <View style={s.headerRight}>
            <Text style={s.headerTitle}>PROFORMA</Text>
            <Text style={s.headerNumber}>{model.numberLabel ?? 'BORRADOR'}</Text>
            <Text style={[s.headerDate, s.headerDateFirst]}>Fecha: {model.date}</Text>
            <Text style={s.headerDate}>Válida hasta: {model.validUntil}</Text>
          </View>
        </View>

        <View style={s.companyRow}>
          {model.company.map((item) => (
            <View key={item.label} style={s.companyItem}>
              <Text style={s.label}>{item.label}</Text>
              <Words style={s.semibold}>{item.value}</Words>
            </View>
          ))}
        </View>

        <View style={s.client}>
          {model.client.map((item, index) => (
            <View
              key={item.label}
              style={compact ? s.clientCell : index % 2 === 0 ? s.clientLeft : s.clientRight}
            >
              <Text style={s.label}>{item.label}</Text>
              <Words style={[s.clientValue, { fontWeight: item.weight }]}>{item.value}</Words>
            </View>
          ))}
        </View>

        <View style={s.table}>
          <TableHead s={s} photos={model.photos} />
          {model.rows.map((row, index) => {
            const photo = row.photo ? images.get(row.photo) : undefined
            return (
              <View key={index} style={s.row} wrap={false}>
                {model.photos ? (
                  <View style={[s.td, s.photo]}>
                    {photo ? (
                      // eslint-disable-next-line jsx-a11y/alt-text -- Image de react-pdf, no es un <img>
                      <Image src={{ data: photo, format: 'jpg' }} style={s.photoImage} />
                    ) : null}
                  </View>
                ) : null}
                <Text style={[s.td, s.quantity]}>{row.quantity}</Text>
                <Text style={[s.td, s.code, s.mono]}>{wrapCode(row.code, codeChars(compact))}</Text>
                <View style={[s.td, s.description]}>
                  {compact ? (
                    // Una línea por producto: nombre y descripción juntos, recortados si no caben.
                    <Text style={s.oneLine}>
                      <Text style={s.semibold}>{row.name}</Text>
                      {row.description ? (
                        <Text style={s.detail}>{`  ·  ${row.description}`}</Text>
                      ) : null}
                    </Text>
                  ) : (
                    <>
                      <Words style={s.semibold}>{row.name}</Words>
                      {row.description ? <Words style={s.detail}>{row.description}</Words> : null}
                    </>
                  )}
                </View>
                <Text style={[s.td, s.unit]}>{row.unitPrice}</Text>
                <Text style={[s.td, s.lineTotal, s.semibold]}>{row.total}</Text>
              </View>
            )
          })}
          {model.photos ? <Text style={s.photoNote}>Imágenes referenciales.</Text> : null}
        </View>

        <View style={s.totals} wrap={false}>
          <View style={s.totalsLeft}>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- Image de react-pdf, no es un <img> */}
            <Image src={brands} style={s.brands} />
            {compact ? (
              <View style={s.inlineBottom}>
                <Terms s={s} terms={model.terms} />
                <Payments s={s} payments={model.payments} />
              </View>
            ) : null}
            <Text style={s.words}>{model.amountInWords}</Text>
          </View>
          <View style={s.totalsBox}>
            {model.adjustments.map((item) => (
              <View key={item.label} style={s.totalsRow}>
                <Text style={s.totalsLabel}>{item.label}</Text>
                <Text>{item.value}</Text>
              </View>
            ))}
            <View style={s.totalBand}>
              <Text style={s.totalLabel}>TOTAL</Text>
              <Text style={s.totalValue}>{model.total}</Text>
            </View>
            {model.taxNote ? (
              // Los importes no se parten entre líneas: «S/» queda unido a su cifra.
              <Text style={s.taxNote}>{model.taxNote.replace(/S\/ /g, 'S/\u00a0')}</Text>
            ) : null}
          </View>
        </View>

        {compact ? null : (
          <View style={s.bottom} wrap={false}>
            <Terms s={s} terms={model.terms} />
            <Payments s={s} payments={model.payments} />
          </View>
        )}

        <View fixed style={s.footer}>
          <Text
            style={s.thanks}
            render={({ pageNumber, totalPages }) =>
              pageNumber === totalPages ? 'Gracias por su preferencia' : ''
            }
          />
          <Text
            style={s.pageNumber}
            render={({ pageNumber, totalPages }) =>
              totalPages > 1 ? `Página ${pageNumber} de ${totalPages}` : ''
            }
          />
        </View>
        <View fixed style={s.limeBar} />
      </Page>
    </Document>
  )
}

const pageCount = (pdf: Buffer) => pdf.toString('latin1').match(/\/Type\s*\/Page\b/g)?.length ?? 0

// Primero con el diseño de la pizarra; si no cabe en una hoja, compactada. Si aun así no cabe, se
// reparte en varias páginas, con la cabecera de la tabla en cada una.
export async function renderProformaPdf(model: DocumentModel, images = NO_PHOTOS) {
  const pdf = await renderToBuffer(<ProformaPdf model={model} images={images} />)
  return pageCount(pdf) === 1
    ? pdf
    : renderToBuffer(<ProformaPdf model={model} images={images} compact />)
}
