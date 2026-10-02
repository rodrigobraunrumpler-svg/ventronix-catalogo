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
const logo = path.join(process.cwd(), 'public/brand/ventronix-wordmark.png')
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
// Caracteres de JetBrains Mono (0,6 em) que caben en la columna CÓDIGO: (64,5 − 15) / (9 × 0,6).
const CODE_CHARS = 9

const s = StyleSheet.create({
  page: {
    fontFamily: 'Jakarta',
    fontSize: 9.75,
    color: color.ink,
    lineHeight: 1.5,
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
    paddingVertical: 19.5,
    paddingHorizontal: SIDE,
  },
  logo: { width: 174 },
  headerRight: { alignItems: 'flex-end' },
  // react-pdf monta «PROFORMA» y el número con interlineado 1.5: se dibujan a 1.2 y el resto del
  // interlineado de la pizarra va en márgenes (más su gap de 2 px), para que las líneas caigan igual.
  headerTitle: {
    marginVertical: 2.9,
    color: '#ffffff',
    fontSize: 19.5,
    fontWeight: 800,
    letterSpacing: 1.56,
    lineHeight: 1.2,
  },
  headerNumber: {
    marginTop: 3.5,
    marginBottom: 2,
    color: color.lime,
    fontFamily: 'JetBrainsMono',
    fontSize: 13.5,
    fontWeight: 700,
    lineHeight: 1.2,
  },
  headerDate: { marginTop: 1.5, color: color.soft, fontSize: 9 },
  companyRow: {
    flexDirection: 'row',
    paddingVertical: 10.5,
    paddingHorizontal: SIDE,
    borderBottomWidth: 0.75,
    borderBottomColor: color.line,
  },
  companyItem: { flex: 1, paddingRight: 9 },
  label: { fontSize: 8.25, color: color.muted },
  semibold: { fontWeight: 600 },
  client: {
    marginTop: 15,
    marginHorizontal: SIDE,
    paddingTop: 12,
    paddingBottom: 4.5,
    paddingHorizontal: 13.5,
    borderWidth: 0.75,
    borderColor: color.line,
    borderRadius: 7.5,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  clientLeft: { width: '60%', paddingRight: 18, marginBottom: 7.5 },
  clientRight: { width: '40%', marginBottom: 7.5 },
  clientValue: { fontSize: 10.5 },
  table: { marginTop: 15, marginHorizontal: SIDE },
  thead: { flexDirection: 'row', backgroundColor: '#000000' },
  th: {
    color: '#ffffff',
    fontSize: 8.25,
    fontWeight: 700,
    letterSpacing: 0.5,
    paddingVertical: 6.75,
    paddingHorizontal: 7.5,
  },
  row: { flexDirection: 'row', borderBottomWidth: 0.75, borderBottomColor: color.line },
  td: { paddingVertical: 8.25, paddingHorizontal: 7.5 },
  quantity: { width: 42 },
  code: { width: 64.5 },
  mono: { fontFamily: 'JetBrainsMono', fontSize: 9 },
  description: { flex: 1 },
  unit: { width: 78, textAlign: 'right' },
  lineTotal: { width: 84, textAlign: 'right' },
  detail: { fontSize: 9, color: color.muted },
  totals: {
    marginTop: 13.5,
    marginHorizontal: SIDE,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  totalsBox: { width: 225 },
  totalsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4.5 },
  totalsLabel: { color: color.text },
  totalBand: {
    marginTop: 3,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#000000',
    borderRadius: 6,
    paddingVertical: 7.5,
    paddingHorizontal: 9,
  },
  totalLabel: { color: '#ffffff', fontSize: 10.5, fontWeight: 700, letterSpacing: 0.42 },
  totalValue: { color: color.lime, fontSize: 13.5, fontWeight: 800 },
  taxNote: { marginTop: 6, fontSize: 8.25, color: color.muted, textAlign: 'right' },
  // A la izquierda de los totales, en el hueco que dejan libre: la franja de marcas arriba y el
  // importe en letras abajo. Así la imagen no alarga la proforma ni la pasa a otra página.
  totalsLeft: {
    flex: 1,
    alignSelf: 'stretch',
    justifyContent: 'space-between',
    paddingRight: 18,
  },
  brands: { width: '100%', marginBottom: 9 },
  words: {
    paddingBottom: 3,
    fontSize: 8.25,
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
  terms: { flex: 1.3, paddingRight: 18 },
  payments: { flex: 1 },
  heading: { fontSize: 9.75, fontWeight: 700, marginBottom: 6 },
  item: { fontSize: 9, color: color.text, marginBottom: 2.25 },
  // Lista numerada con sangría francesa, como el <ol> de la pizarra (18 px).
  term: { flexDirection: 'row' },
  termNumber: { width: 11.25, marginRight: 2.25, textAlign: 'right' },
  termText: { flex: 1 },
  flow: { flexDirection: 'row', flexWrap: 'wrap' },
  // Los textos que dependen de la página van dentro de un contenedor fijo: react-pdf 4.9 no dibuja
  // un texto dinámico (render) que sea él mismo absoluto.
  footer: { position: 'absolute', bottom: 15, left: SIDE, right: SIDE, height: 16 },
  thanks: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    textAlign: 'center',
    fontSize: 9.75,
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

type TextStyle = ComponentProps<typeof View>['style']

// Texto escrito por el usuario. Si trae una palabra más larga que su columna (ver flowPieces), sus
// trozos van en filas que saltan de línea; la caja ocupa el lugar del texto y le pasa su estilo.
function Words({ children, style }: { children: string; style?: TextStyle }) {
  const paragraphs = flowPieces(children)
  if (!paragraphs) return <Text style={style}>{children}</Text>
  return (
    <View style={style}>
      {paragraphs.map((pieces, index) => (
        <View key={index} style={s.flow}>
          {pieces.map((piece, key) => (
            <Text key={key}>{piece}</Text>
          ))}
        </View>
      ))}
    </View>
  )
}

function TableHead() {
  return (
    <View fixed style={s.thead}>
      <Text style={[s.th, s.quantity]}>CANT.</Text>
      <Text style={[s.th, s.code]}>CÓDIGO</Text>
      <Text style={[s.th, s.description]}>DESCRIPCIÓN</Text>
      <Text style={[s.th, s.unit]}>P. UNIT.</Text>
      <Text style={[s.th, s.lineTotal]}>TOTAL</Text>
    </View>
  )
}

// Plantilla A4 de la proforma, igual a la pizarra del prototipo (spec del documento §4).
export function ProformaPdf({ model }: { model: DocumentModel }) {
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
            <Text style={[s.headerDate, { marginTop: 6 }]}>Fecha: {model.date}</Text>
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
            <View key={item.label} style={index % 2 === 0 ? s.clientLeft : s.clientRight}>
              <Text style={s.label}>{item.label}</Text>
              <Words style={[s.clientValue, { fontWeight: item.weight }]}>{item.value}</Words>
            </View>
          ))}
        </View>

        <View style={s.table}>
          <TableHead />
          {model.rows.map((row, index) => (
            <View key={index} style={s.row} wrap={false}>
              <Text style={[s.td, s.quantity]}>{row.quantity}</Text>
              <Text style={[s.td, s.code, s.mono]}>{wrapCode(row.code, CODE_CHARS)}</Text>
              <View style={[s.td, s.description]}>
                <Words style={s.semibold}>{row.name}</Words>
                {row.description ? <Words style={s.detail}>{row.description}</Words> : null}
              </View>
              <Text style={[s.td, s.unit]}>{row.unitPrice}</Text>
              <Text style={[s.td, s.lineTotal, s.semibold]}>{row.total}</Text>
            </View>
          ))}
        </View>

        <View style={s.totals} wrap={false}>
          <View style={s.totalsLeft}>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- Image de react-pdf, no es un <img> */}
            <Image src={brands} style={s.brands} />
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

        <View style={s.bottom} wrap={false}>
          <View style={s.terms}>
            <Text style={s.heading}>Términos y condiciones</Text>
            {model.terms.map((term, index) => (
              <View key={index} style={s.term}>
                <Text style={[s.item, s.termNumber]}>{index + 1}.</Text>
                <Words style={[s.item, s.termText]}>{term}</Words>
              </View>
            ))}
          </View>
          {model.payments.length > 0 ? (
            <View style={s.payments}>
              <Text style={s.heading}>Cuentas para el pago</Text>
              {model.payments.map((line, index) => (
                <Words key={index} style={s.item}>
                  {line}
                </Words>
              ))}
            </View>
          ) : null}
        </View>

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

export function renderProformaPdf(model: DocumentModel) {
  return renderToBuffer(<ProformaPdf model={model} />)
}
