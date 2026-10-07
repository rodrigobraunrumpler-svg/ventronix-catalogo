import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CompanyForm } from '@/features/company/components/company-form'
import type { CompanyInput, CompanyProfile } from '@/features/company/schemas'
import { DEFAULT_WHATSAPP_MESSAGE } from '@/features/proforma/document/format'
import type { RucLookupResult } from '@/features/proforma/ruc'
import type { ActionResult } from '@/lib/action-result'
import { completeCompany, emptyCompany } from '../support/company'

type Lookup = (ruc: string) => Promise<RucLookupResult>

function renderForm(
  profile: CompanyProfile = emptyCompany,
  result: ActionResult<CompanyProfile> = { ok: true, data: profile },
  lookupRuc?: Lookup,
) {
  const onSubmit = vi.fn<(values: CompanyInput) => Promise<ActionResult<CompanyProfile>>>(
    async () => result,
  )
  const onSaved = vi.fn()
  render(
    <CompanyForm profile={profile} onSubmit={onSubmit} onSaved={onSaved} lookupRuc={lookupRuc} />,
  )
  return { onSubmit, onSaved, user: userEvent.setup() }
}

const save = () => screen.getByRole('button', { name: 'Guardar cambios' })
const tab = (name: RegExp) => screen.getByRole('tab', { name })
const sunat: RucLookupResult = {
  kind: 'found',
  company: {
    ruc: '20000000001',
    legalName: 'EMPRESA DE PRUEBA S.A.C.',
    address: 'AV. PRUEBA 123, HUAMANGA',
    status: 'ACTIVO',
    condition: 'HABIDO',
  },
}

describe('CompanyForm', () => {
  it('«Guardar cambios» va en la tarjeta del formulario, junto a los campos, no en la cabecera', () => {
    renderForm(completeCompany)
    const card = screen.getByRole('tablist', {
      name: 'Secciones de los datos de la empresa',
    }).parentElement!
    const header = screen.getByRole('heading', { level: 1, name: 'Empresa' }).parentElement!
      .parentElement!
    expect(card).toContainElement(save())
    expect(header).not.toContainElement(save())
  })

  it('muestra una sección a la vez, con la vista previa al lado', async () => {
    const { user } = renderForm()
    expect(tab(/Datos/)).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByLabelText('Razón social')).toBeVisible()
    expect(screen.queryByLabelText('Dirección')).not.toBeInTheDocument()
    await user.click(tab(/Contacto/))
    expect(screen.getByLabelText('Dirección')).toBeVisible()
    expect(
      screen.getByRole('complementary', { name: 'Así saldrá en tus proformas' }),
    ).toHaveTextContent('[Razón social]')
  })

  it('al guardar con datos pendientes lleva al primer error y marca las secciones', async () => {
    const { onSubmit, user } = renderForm()
    await user.click(tab(/Pagos/))
    await user.click(save())
    expect(await screen.findByText('Escribe la razón social.')).toBeVisible()
    expect(tab(/Datos/)).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByLabelText('Razón social')).toHaveFocus()
    expect(screen.getByRole('alert')).toHaveTextContent('Revisa los campos marcados.')
    expect(tab(/Contacto/)).toHaveAccessibleName(/2 campos por revisar/)
    await user.click(tab(/Contacto/))
    expect(screen.getByText('Escribe la dirección.')).toBeVisible()
    expect(screen.getByLabelText('Teléfono 1')).toHaveAttribute('aria-invalid', 'true')
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('guarda los datos normalizados, con cuentas y números de Yape o Plin', async () => {
    const { onSubmit, onSaved, user } = renderForm()
    await user.type(screen.getByLabelText('Razón social'), 'Empresa de Pruebas S.A.C.')
    await user.type(screen.getByLabelText('RUC'), '20000000001')
    await user.click(tab(/Contacto/))
    await user.type(screen.getByLabelText('Dirección'), 'Av. Prueba 123')
    await user.type(screen.getByLabelText('Teléfono 1'), '066 312345')
    await user.click(tab(/Pagos/))
    await user.click(screen.getByRole('button', { name: 'Añadir cuenta' }))
    await user.type(screen.getByLabelText('Banco de la cuenta 1'), 'BCP')
    await user.type(screen.getByLabelText('Número de cuenta 1'), '191-1234567-0-12')
    await user.type(screen.getByLabelText('CCI de la cuenta 1'), '002-191-001234567012-54')
    await user.click(screen.getByRole('button', { name: 'Añadir número de Yape o Plin' }))
    const kind = screen.getByRole('radiogroup', { name: 'Tipo del número 1' })
    await user.click(within(kind).getByRole('radio', { name: 'Plin' }))
    await user.type(screen.getByLabelText('Número 1 de Yape o Plin'), '987 654 321')
    await user.click(save())

    await vi.waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        legal_name: 'Empresa de Pruebas S.A.C.',
        trade_name: null,
        phones: [{ number: '066 312345' }],
        default_validity_days: 7,
        bank_accounts: [
          { bank: 'BCP', account: '191-1234567-0-12', cci: '00219100123456701254', holder: null },
        ],
        wallets: [{ kind: 'plin', number: '987654321' }],
      }),
    )
    expect(screen.getByRole('status')).toHaveTextContent('Cambios guardados')
  })

  it('Subir y Bajar cambian el orden de las cuentas', async () => {
    const { onSubmit, user } = renderForm({
      ...completeCompany,
      bank_accounts: [
        { bank: 'BCP', account: '1911234567012', cci: '00219100123456701254', holder: null },
        { bank: 'Interbank', account: '2003001234567', cci: '00320000300123456722', holder: null },
      ],
    })
    await user.click(tab(/Pagos/))
    await user.click(screen.getByRole('button', { name: 'Bajar cuenta 1' }))
    await user.click(save())
    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalled())
    expect(onSubmit.mock.calls[0][0].bank_accounts.map((account) => account.bank)).toEqual([
      'Interbank',
      'BCP',
    ])
  })

  it('no deja quitar el único teléfono', async () => {
    const { user } = renderForm(completeCompany)
    await user.click(tab(/Contacto/))
    expect(screen.getByRole('button', { name: 'Quitar teléfono 1' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Añadir teléfono' }))
    expect(screen.getByRole('button', { name: 'Quitar teléfono 1' })).toBeEnabled()
  })

  it('muestra el error del servidor sin perder lo escrito', async () => {
    const { onSaved, user } = renderForm(completeCompany, {
      ok: false,
      error: { code: 'UNEXPECTED', message: 'No se pudo completar la operación.' },
    })
    await user.click(save())
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo completar la operación.')
    expect(screen.getByLabelText('Razón social')).toHaveValue('Empresa de Pruebas S.A.C.')
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('con el RUC completa desde SUNAT la razón social y la dirección vacías', async () => {
    const lookupRuc = vi.fn<Lookup>(async () => sunat)
    const { user } = renderForm(emptyCompany, undefined, lookupRuc)
    await user.type(screen.getByLabelText('RUC'), '20000000001')
    expect(await screen.findByDisplayValue('EMPRESA DE PRUEBA S.A.C.')).toBeVisible()
    expect(lookupRuc).toHaveBeenCalledTimes(1)
    await user.click(tab(/Contacto/))
    expect(screen.getByLabelText('Dirección')).toHaveValue('AV. PRUEBA 123, HUAMANGA')
  })

  it('no pisa una razón social ya escrita', async () => {
    const lookupRuc = vi.fn<Lookup>(async () => sunat)
    const { user } = renderForm(emptyCompany, undefined, lookupRuc)
    await user.type(screen.getByLabelText('Razón social'), 'Mi empresa')
    await user.type(screen.getByLabelText('RUC'), '20000000001')
    await vi.waitFor(() => expect(lookupRuc).toHaveBeenCalledTimes(1))
    expect(screen.getByLabelText('Razón social')).toHaveValue('Mi empresa')
  })

  it('la vista previa muestra los datos como saldrán en la proforma', () => {
    renderForm({
      ...completeCompany,
      trade_name: 'Pruebas',
      wallets: [{ kind: 'ambos', number: '987654321' }],
    })
    const preview = screen.getByRole('complementary', { name: 'Así saldrá en tus proformas' })
    expect(preview).toHaveTextContent('Empresa de Pruebas S.A.C. · Pruebas')
    expect(preview).toHaveTextContent('RUC 20000000001')
    expect(preview).toHaveTextContent('Tel. 066 312 345')
    expect(preview).toHaveTextContent('Yape / Plin: 987 654 321')
    expect(preview).toHaveTextContent('1. Validez de la oferta: 7 días.')
    expect(preview).toHaveTextContent('2. [Condición de pago]')
  })
})

describe('mensaje de WhatsApp', () => {
  it('muestra el mensaje original y cómo lo recibe el cliente, con datos de ejemplo', async () => {
    const { user } = renderForm({ ...completeCompany, trade_name: 'Ventronix' })
    await user.click(tab(/Mensaje/))
    expect(screen.getByLabelText('Texto del mensaje')).toHaveValue(DEFAULT_WHATSAPP_MESSAGE)
    expect(
      screen.getByText(
        'Hola, Inversiones Nuevo Sol S.A.C. Le envío la proforma N° 0049 por S/ 6,760.00, válida hasta el 13/10/2026. Quedamos atentos. — Ventronix',
      ),
    ).toBeVisible()
    expect(screen.getByText(`${DEFAULT_WHATSAPP_MESSAGE.length} / 500`)).toBeVisible()
  })

  it('inserta un dato donde está el cursor y guarda el mensaje', async () => {
    const { onSubmit, user } = renderForm(completeCompany)
    await user.click(tab(/Mensaje/))
    const text = screen.getByLabelText('Texto del mensaje')
    await user.clear(text)
    await user.type(text, 'Adjunto su proforma por ')
    const fields = within(screen.getByRole('group', { name: 'Insertar dato' }))
    await user.click(fields.getByRole('button', { name: 'Total' }))
    expect(text).toHaveValue('Adjunto su proforma por {total}')
    expect(screen.getByText('Adjunto su proforma por S/ 6,760.00')).toBeVisible()
    await user.click(save())
    await vi.waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ whatsapp_message: 'Adjunto su proforma por {total}' }),
      ),
    )
  })

  it('avisa si algo entre llaves no es un dato', async () => {
    const { user } = renderForm(completeCompany)
    await user.click(tab(/Mensaje/))
    const text = screen.getByLabelText('Texto del mensaje')
    await user.clear(text)
    await user.click(text)
    await user.paste('Hola {cliente}, su precio es {precio}')
    expect(
      screen.getByText(
        '{precio} no es un dato y se enviará tal cual. Usa los botones para insertar los datos.',
      ),
    ).toBeVisible()
  })

  it('«Volver al mensaje original» lo recupera', async () => {
    const { user } = renderForm({ ...completeCompany, whatsapp_message: 'Hola {cliente}' })
    await user.click(tab(/Mensaje/))
    expect(screen.getByLabelText('Texto del mensaje')).toHaveValue('Hola {cliente}')
    await user.click(screen.getByRole('button', { name: 'Volver al mensaje original' }))
    expect(screen.getByLabelText('Texto del mensaje')).toHaveValue(DEFAULT_WHATSAPP_MESSAGE)
  })
})
