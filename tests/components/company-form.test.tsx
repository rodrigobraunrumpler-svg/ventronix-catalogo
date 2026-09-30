import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CompanyForm } from '@/features/company/components/company-form'
import type { CompanyInput, CompanyProfile } from '@/features/company/schemas'
import type { ActionResult } from '@/lib/action-result'
import { completeCompany, emptyCompany } from '../support/company'

function renderForm(
  profile: CompanyProfile = emptyCompany,
  result: ActionResult<CompanyProfile> = { ok: true, data: profile },
) {
  const onSubmit = vi.fn<(values: CompanyInput) => Promise<ActionResult<CompanyProfile>>>(
    async () => result,
  )
  const onSaved = vi.fn()
  render(<CompanyForm profile={profile} onSubmit={onSubmit} onSaved={onSaved} />)
  return { onSubmit, onSaved, user: userEvent.setup() }
}

const save = () => screen.getByRole('button', { name: 'Guardar cambios' })

describe('CompanyForm', () => {
  it('marca lo obligatorio y no guarda', async () => {
    const { onSubmit, user } = renderForm()
    await user.click(save())
    expect(await screen.findByText('Escribe la razón social.')).toBeVisible()
    expect(
      screen.getByText('Escribe un RUC válido: 11 dígitos con su dígito verificador.'),
    ).toBeVisible()
    expect(screen.getByText('Escribe la dirección.')).toBeVisible()
    expect(screen.getByLabelText('Teléfono 1')).toHaveAttribute('aria-invalid', 'true')
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('guarda los datos normalizados, con cuentas y números de Yape o Plin', async () => {
    const { onSubmit, onSaved, user } = renderForm()
    await user.type(screen.getByLabelText('Razón social'), 'Empresa de Pruebas S.A.C.')
    await user.type(screen.getByLabelText('RUC'), '20000000001')
    await user.type(screen.getByLabelText('Dirección'), 'Av. Prueba 123')
    await user.type(screen.getByLabelText('Teléfono 1'), '066 312345')
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
  })

  it('Subir y Bajar cambian el orden de las cuentas', async () => {
    const { onSubmit, user } = renderForm({
      ...completeCompany,
      bank_accounts: [
        { bank: 'BCP', account: '1911234567012', cci: '00219100123456701254', holder: null },
        { bank: 'Interbank', account: '2003001234567', cci: '00320000300123456722', holder: null },
      ],
    })
    await user.click(screen.getByRole('button', { name: 'Bajar cuenta 1' }))
    await user.click(save())
    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalled())
    expect(onSubmit.mock.calls[0][0].bank_accounts.map((account) => account.bank)).toEqual([
      'Interbank',
      'BCP',
    ])
  })

  it('pide al menos un teléfono', async () => {
    const { onSubmit, user } = renderForm(completeCompany)
    await user.click(screen.getByRole('button', { name: 'Quitar teléfono 1' }))
    await user.click(save())
    expect(await screen.findByText('Añade al menos un teléfono.')).toBeVisible()
    expect(onSubmit).not.toHaveBeenCalled()
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

  it('la vista previa muestra los datos como saldrán en la proforma', () => {
    renderForm({
      ...completeCompany,
      trade_name: 'Pruebas',
      wallets: [{ kind: 'ambos', number: '987654321' }],
    })
    const preview = screen.getByRole('complementary', { name: 'Vista previa' })
    expect(preview).toHaveTextContent('Pruebas')
    expect(preview).toHaveTextContent(/RUC\s*20000000001/)
    expect(preview).toHaveTextContent('Yape / Plin: 987 654 321')
    expect(preview).toHaveTextContent('Validez de la oferta: 7 días.')
  })
})
