import 'server-only'
import path from 'node:path'
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
import type { DocumentModel } from './model'

const fonts = path.join(process.cwd(), 'src/features/proforma/document/fonts')
const logo = path.join(process.cwd(), 'public/brand/ventronix-wordmark.png')

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
// Hueco arriba de cada página para repetir la cabecera de la tabla desde la segunda página. La
// franja negra de la primera página lo ocupa con un margen negativo.
const REPEAT = 36

const s = StyleSheet.create({
  page: {
    fontFamily: 'Jakarta',
    fontSize: 9.75,
    color: color.ink,
    lineHeight: 1.5,
    paddingTop: REPEAT,
    paddingBottom: 48,
  },
  watermark: {
    position: 'absolute',
    top: 360,
    left: 40,
    fontSize: 110,
    fontWeight: 800,
    color: color.lime,
    opacity: 0.12,
    transform: 'rotate(-30deg)',
  },
  repeatHead: { position: 'absolute', top: 12, left: SIDE, right: SIDE },
  header: {
    marginTop: -REPEAT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#000000',
    paddingVertical: 19.5,
    paddingHorizontal: SIDE,
  },
  logo: { width: 174 },
  headerRight: { alignItems: 'flex-end' },
  headerTitle: { color: '#ffffff', fontSize: 19.5, fontWeight: 800, letterSpacing: 1.56 },
  headerNumber: { color: color.lime, fontFamily: 'JetBrainsMono', fontSize: 13.5, fontWeight: 700 },
  headerDate: { color: color.soft, fontSize: 9 },
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
  bold: { fontWeight: 700 },
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
  totals: { marginTop: 13.5, marginHorizontal: SIDE, alignItems: 'flex-end' },
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
  taxNote: { marginTop: 1.5, fontSize: 8.25, color: color.muted, textAlign: 'right' },
  words: {
    width: 300,
    marginTop: 4.5,
    fontSize: 8.25,
    fontWeight: 600,
    color: color.text,
    textAlign: 'right',
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
  thanks: {
    position: 'absolute',
    bottom: 18,
    left: 0,
    right: 0,
    textAlign: 'center',
    fontSize: 9.75,
    fontWeight: 600,
    color: color.text,
  },
  pageNumber: { position: 'absolute', bottom: 18, right: SIDE, fontSize: 8.25, color: color.muted },
  limeBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 6,
    backgroundColor: color.lime,
  },
})

function TableHead() {
  return (
    <View style={s.thead}>
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
        <View
          fixed
          style={s.repeatHead}
          render={({ pageNumber }) => (pageNumber > 1 ? <TableHead /> : null)}
        />

        <View style={s.header}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- Image de react-pdf, no es un <img> */}
          <Image src={logo} style={s.logo} />
          <View style={s.headerRight}>
            <Text style={s.headerTitle}>PROFORMA</Text>
            <Text style={s.headerNumber}>{model.numberLabel ?? 'BORRADOR'}</Text>
            <Text style={[s.headerDate, { marginTop: 4.5 }]}>Fecha: {model.date}</Text>
            <Text style={s.headerDate}>Válida hasta: {model.validUntil}</Text>
          </View>
        </View>

        <View style={s.companyRow}>
          {model.company.map((item) => (
            <View key={item.label} style={s.companyItem}>
              <Text style={s.label}>{item.label}</Text>
              <Text style={s.semibold}>{item.value}</Text>
            </View>
          ))}
        </View>

        <View style={s.client}>
          {model.client.map((item, index) => (
            <View key={item.label} style={index % 2 === 0 ? s.clientLeft : s.clientRight}>
              <Text style={s.label}>{item.label}</Text>
              <Text style={item.strong ? [s.clientValue, s.bold] : s.clientValue}>
                {item.value}
              </Text>
            </View>
          ))}
        </View>

        <View style={s.table}>
          <TableHead />
          {model.rows.map((row, index) => (
            <View key={index} style={s.row} wrap={false}>
              <Text style={[s.td, s.quantity]}>{row.quantity}</Text>
              <Text style={[s.td, s.code, s.mono]}>{row.code}</Text>
              <View style={[s.td, s.description]}>
                <Text style={s.semibold}>{row.name}</Text>
                {row.description ? <Text style={s.detail}>{row.description}</Text> : null}
              </View>
              <Text style={[s.td, s.unit]}>{row.unitPrice}</Text>
              <Text style={[s.td, s.lineTotal, s.semibold]}>{row.total}</Text>
            </View>
          ))}
        </View>

        <View style={s.totals} wrap={false}>
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
            {model.taxNote ? <Text style={s.taxNote}>{model.taxNote}</Text> : null}
          </View>
          <Text style={s.words}>{model.amountInWords}</Text>
        </View>

        <View style={s.bottom} wrap={false}>
          <View style={s.terms}>
            <Text style={s.heading}>Términos y condiciones</Text>
            {model.terms.map((term, index) => (
              <Text key={index} style={s.item}>
                {index + 1}. {term}
              </Text>
            ))}
          </View>
          {model.payments.length > 0 ? (
            <View style={s.payments}>
              <Text style={s.heading}>Cuentas para el pago</Text>
              {model.payments.map((payment, index) => (
                <Text key={index} style={payment.strong ? [s.item, s.semibold] : s.item}>
                  {payment.text}
                </Text>
              ))}
            </View>
          ) : null}
        </View>

        <Text
          fixed
          style={s.thanks}
          render={({ pageNumber, totalPages }) =>
            pageNumber === totalPages ? 'Gracias por su preferencia' : ''
          }
        />
        <Text
          fixed
          style={s.pageNumber}
          render={({ pageNumber, totalPages }) =>
            totalPages > 1 ? `Página ${pageNumber} de ${totalPages}` : ''
          }
        />
        <View fixed style={s.limeBar} />
      </Page>
    </Document>
  )
}

export function renderProformaPdf(model: DocumentModel) {
  return renderToBuffer(<ProformaPdf model={model} />)
}
