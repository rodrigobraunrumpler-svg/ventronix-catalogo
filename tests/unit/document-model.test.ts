import { describe, expect, it } from 'vitest'
import type { CompanyProfile } from '@/features/company/schemas'
import { buildDocumentModel, documentProblem } from '@/features/proforma/document/model'
import {
  documentInput,
  documentInputSchema,
  type DocumentInput,
} from '@/features/proforma/document/input'
import { EMPTY_DRAFT } from '@/features/proforma/draft'
import { completeCompany, e1Lines, freeLine } from '../support/proforma'

const company: CompanyProfile = {
  ...completeCompany,
  trade_name: 'Ventronix',
  phones: ['066 312345', '987654321'],
  email: 'ventas@ventronix.pe',
  payment_terms: 'Contado contra entrega.',
  return_policy: 'Cambios dentro de los 7 días.',
  bank_accounts: [
    { bank: 'BCP', account: '191-1234567-0-12', cci: '00219100123456701254', holder: null },
  ],
  wallets: [{ kind: 'ambos', number: '987654321' }],
}

const client = {
  name: 'Cliente de ejemplo S.A.C.',
  document: '20000000001',
  phone: '900000000',
  address: 'Av. Ejemplo 123, Huamanga',
  deliveryTime: '3 días hábiles',
}

// El ejemplo E1 de la spec de la proforma, ya generado con el número 1.
const e1: DocumentInput = documentInput(
  {
    ...EMPTY_DRAFT,
    lines: e1Lines,
    client,
    discountPercent: '5',
    shipping: '20',
    number: 1,
    issuedAt: '2026-09-30T15:00:00.000Z',
  },
  { draft: false },
)
const now = new Date('2026-10-02T15:00:00Z')

describe('buildDocumentModel', () => {
  it('arma todos los textos del documento del ejemplo E1', () => {
    expect(buildDocumentModel(e1, company, now)).toEqual({
      draft: false,
      title: 'Proforma N° 0001',
      author: 'Ventronix',
      fileName: 'Proforma-0001-Cliente-de-ejemplo-SAC.pdf',
      numberLabel: 'N° 0001',
      date: '30/09/2026',
      validUntil: '07/10/2026',
      company: [
        { label: 'RUC', value: '20000000001' },
        { label: 'Dirección', value: 'Av. Prueba 123, Huamanga' },
        { label: 'Teléfono', value: '066 312 345 / 987 654 321' },
        { label: 'Correo', value: 'ventas@ventronix.pe' },
      ],
      client: [
        { label: 'Cliente', value: 'Cliente de ejemplo S.A.C.', weight: 700 },
        { label: 'RUC', value: '20000000001', weight: 600 },
        { label: 'Dirección', value: 'Av. Ejemplo 123, Huamanga', weight: 400 },
        { label: 'Celular', value: '900 000 000', weight: 400 },
        { label: 'Tiempo de entrega', value: '3 días hábiles', weight: 400 },
      ],
      photos: false,
      rows: [
        {
          quantity: '2',
          code: 'LAP-001',
          name: 'Laptop de 14 pulgadas',
          description: null,
          unitPrice: '2,590.00',
          total: '5,180.00',
          photo: null,
        },
        {
          quantity: '1',
          code: 'IMP-001',
          name: 'Impresora láser',
          description: null,
          unitPrice: '850.00',
          total: '850.00',
          photo: null,
        },
        {
          quantity: '1',
          code: 'CMP-001',
          name: 'Computadora de escritorio',
          description: null,
          unitPrice: '2,490.00',
          total: '2,490.00',
          photo: null,
        },
      ],
      adjustments: [
        { label: 'Total parcial', value: 'S/ 8,520.00' },
        { label: 'Descuento (5%)', value: '− S/ 426.00' },
        { label: 'Neto', value: 'S/ 8,094.00' },
        { label: 'Envío', value: 'S/ 20.00' },
      ],
      total: 'S/ 8,114.00',
      taxNote: 'Precios incluyen IGV · Op. gravada S/ 6,876.27 · IGV (18%) S/ 1,237.73',
      amountInWords: 'SON: OCHO MIL CIENTO CATORCE CON 00/100 SOLES',
      terms: [
        'Validez de la oferta: 7 días.',
        'Contado contra entrega.',
        'Cambios dentro de los 7 días.',
      ],
      payments: [
        'BCP · Cta. 191-1234567-0-12',
        'CCI 00219100123456701254',
        'Yape / Plin: 987 654 321',
      ],
    })
  })

  it('muestra el titular de una cuenta solo si no es la propia empresa', () => {
    const withHolder = {
      ...company,
      bank_accounts: [{ ...company.bank_accounts[0], holder: 'Juan Pérez' }],
    }
    expect(buildDocumentModel(e1, withHolder, now).payments.slice(0, 3)).toEqual([
      'BCP · Cta. 191-1234567-0-12',
      'CCI 00219100123456701254',
      'Titular: Juan Pérez',
    ])
  })

  it('sin descuento ni envío solo muestra el total; con DNI lo nombra', () => {
    const model = buildDocumentModel(
      { ...e1, discountPercent: '', shipping: '', client: { ...client, document: '12345678' } },
      company,
      now,
    )
    expect(model.adjustments).toEqual([])
    expect(model.client[1]).toEqual({ label: 'DNI', value: '12345678', weight: 600 })
  })

  it('el borrador lleva marca, sin número de archivo y con la fecha de hoy', () => {
    const model = buildDocumentModel(
      { ...e1, draft: true, number: null, issuedAt: null },
      company,
      now,
    )
    expect(model).toMatchObject({
      draft: true,
      numberLabel: null,
      title: 'Proforma (borrador)',
      fileName: 'Proforma-borrador-Cliente-de-ejemplo-SAC.pdf',
      date: '02/10/2026',
    })
  })
})

describe('documentProblem', () => {
  it('deja generar el ejemplo completo', () => {
    expect(documentProblem(e1, company)).toBeNull()
  })

  it('pide los datos de la empresa y del cliente para el documento final', () => {
    expect(documentProblem(e1, { ...company, ruc: null })).toBe(
      'Completa los datos de tu empresa antes de generar el documento.',
    )
    expect(documentProblem({ ...e1, client: { ...client, name: ' ' } }, company)).toBe(
      'Completa los datos del cliente.',
    )
  })

  it('el borrador solo necesita cifras válidas', () => {
    const draft = { ...e1, draft: true, number: null, client: { ...client, name: '' } }
    expect(documentProblem(draft, { ...company, ruc: null })).toBeNull()
    expect(documentProblem({ ...draft, discountPercent: '100', shipping: '' }, company)).toBe(
      'Revisa las cantidades, los precios y los totales.',
    )
  })

  it('también el borrador necesita una validez de 1 a 365 días', () => {
    const draft = { ...e1, draft: true, number: null }
    const problem = 'Revisa la validez de la oferta: de 1 a 365 días.'
    expect(documentProblem({ ...draft, validityDays: 'abc' }, company)).toBe(problem)
    expect(documentProblem({ ...draft, validityDays: '0' }, company)).toBe(problem)
    expect(documentProblem({ ...e1, validityDays: '400' }, company)).toBe(problem)
    expect(documentProblem({ ...draft, validityDays: '' }, company)).toBeNull()
  })
})

describe('producto libre', () => {
  it('sin código sale con «—» en el documento', () => {
    const free = documentInput(
      {
        ...EMPTY_DRAFT,
        lines: [freeLine()],
        client,
        number: 1,
        issuedAt: '2026-09-30T15:00:00.000Z',
      },
      { draft: false },
    )
    expect(documentInputSchema.parse(free).lines[0].code).toBe('')
    expect(buildDocumentModel(free, company, now).rows[0]).toMatchObject({
      code: '—',
      name: 'Instalación en sitio',
      unitPrice: '350.00',
    })
  })
})

describe('fotos', () => {
  const path = 'products/8b3e4c9a-5d6f-4e7a-8b1c-2d3e4f5a6b7c.jpg'
  const withPhoto = (includePhotos: boolean): DocumentInput => ({
    ...e1,
    includePhotos,
    lines: e1.lines.map((item, index) => (index === 0 ? { ...item, imagePath: path } : item)),
  })

  it('con el interruptor, la columna lleva la ruta de cada foto', () => {
    const model = buildDocumentModel(withPhoto(true), company, now)
    expect(model.photos).toBe(true)
    expect(model.rows.map((row) => row.photo)).toEqual([path, null, null])
  })

  it('sin el interruptor o sin ninguna foto, no hay columna', () => {
    expect(buildDocumentModel(withPhoto(false), company, now)).toMatchObject({ photos: false })
    expect(buildDocumentModel({ ...e1, includePhotos: true }, company, now).photos).toBe(false)
  })

  it('el servidor solo acepta rutas de fotos del bucket', () => {
    for (const imagePath of [
      'otros/foto.jpg',
      'https://otro.sitio/foto.jpg',
      'products/../8b3e4c9a-5d6f-4e7a-8b1c-2d3e4f5a6b7c.jpg',
    ]) {
      const value = { ...e1, lines: [{ ...e1.lines[0], imagePath }] }
      expect(documentInputSchema.safeParse(value).success, imagePath).toBe(false)
    }
  })

  it('lee lo que envía un navegador con la versión anterior, sin fotos', () => {
    const old: Record<string, unknown> = {
      ...e1,
      lines: e1.lines.map(({ code, name, description, unitPrice, quantity }) => ({
        code,
        name,
        description,
        unitPrice,
        quantity,
      })),
    }
    delete old.includePhotos
    const parsed = documentInputSchema.parse(old)
    expect(parsed.includePhotos).toBe(false)
    expect(parsed.lines[0].imagePath).toBeNull()
  })
})
