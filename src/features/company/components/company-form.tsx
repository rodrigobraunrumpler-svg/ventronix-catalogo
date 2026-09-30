'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useFieldArray, useForm, useWatch } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { ActionResult } from '@/lib/action-result'
import { cn } from '@/lib/utils'
import {
  ACCOUNT_LIMIT,
  companyProfileSchema,
  PHONE_LIMIT,
  WALLET_LIMIT,
  type CompanyFormValues,
  type CompanyInput,
  type CompanyProfile,
} from '../schemas'
import { CompanyPreview } from './company-preview'

const SCALAR_FIELDS = [
  'legal_name',
  'trade_name',
  'ruc',
  'address',
  'email',
  'payment_terms',
  'return_policy',
  'default_validity_days',
] as const

const KIND_OPTIONS = [
  ['yape', 'Yape'],
  ['plin', 'Plin'],
  ['ambos', 'Ambos'],
] as const

function toFormValues(profile: CompanyProfile): CompanyFormValues {
  return {
    legal_name: profile.legal_name ?? '',
    trade_name: profile.trade_name ?? '',
    ruc: profile.ruc ?? '',
    address: profile.address ?? '',
    // El teléfono es obligatorio: al empezar ya hay uno vacío a la vista.
    phones:
      profile.phones.length > 0 ? profile.phones.map((number) => ({ number })) : [{ number: '' }],
    email: profile.email ?? '',
    payment_terms: profile.payment_terms ?? '',
    return_policy: profile.return_policy ?? '',
    default_validity_days: String(profile.default_validity_days),
    bank_accounts: profile.bank_accounts.map((account) => ({
      ...account,
      holder: account.holder ?? '',
    })),
    wallets: profile.wallets,
  }
}

const describedBy = (id: string, error?: { message?: string }) => ({
  id,
  'aria-invalid': error ? true : undefined,
  'aria-describedby': error ? `${id}-error` : undefined,
})

function ErrorText({ id, error }: { id: string; error?: string }) {
  return error ? (
    <p id={`${id}-error`} className="text-xs font-medium text-destructive">
      {error}
    </p>
  ) : null
}

function Field({
  id,
  label,
  error,
  optional,
  className,
  children,
}: {
  id: string
  label: string
  error?: string
  optional?: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <div className={cn('grid content-start gap-1.5', className)}>
      <div className="flex items-center gap-2">
        <Label htmlFor={id}>{label}</Label>
        {optional ? (
          <span className="rounded-full bg-muted px-2 text-xs text-muted-foreground">Opcional</span>
        ) : null}
      </div>
      {children}
      <ErrorText id={id} error={error} />
    </div>
  )
}

function Section({
  id,
  title,
  description,
  children,
}: {
  id: string
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <section aria-labelledby={id} className="grid gap-4 rounded-[14px] border bg-card p-5">
      <div className="grid gap-0.5">
        <h2 id={id} className="text-[15px] font-bold">
          {title}
        </h2>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {children}
    </section>
  )
}

type CompanyFormProps = {
  profile: CompanyProfile
  onSubmit: (values: CompanyInput) => Promise<ActionResult<CompanyProfile>>
  onSaved: () => void
}

// Datos de la empresa por secciones, con los errores junto a cada campo (spec §6.2).
export function CompanyForm({ profile, onSubmit, onSaved }: CompanyFormProps) {
  const [serverError, setServerError] = useState<string | null>(null)
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(companyProfileSchema),
    defaultValues: toFormValues(profile),
  })
  const phones = useFieldArray({ control, name: 'phones' })
  const accounts = useFieldArray({ control, name: 'bank_accounts' })
  const wallets = useFieldArray({ control, name: 'wallets' })
  const live = useWatch({ control })
  // Error de la lista entera («Añade al menos un teléfono.»). Tras quitar teléfonos, React Hook
  // Form lo guarda en `root` porque recuerda los campos quitados.
  const phonesError = errors.phones?.message ?? errors.phones?.root?.message

  const save = handleSubmit(async (values) => {
    setServerError(null)
    const result = await onSubmit(values)
    if (result.ok) {
      onSaved()
      return
    }
    const fieldErrors = result.error.fieldErrors ?? {}
    const invalid = SCALAR_FIELDS.filter((field) => fieldErrors[field]?.[0])
    invalid.forEach((field, index) =>
      setError(field, { message: fieldErrors[field][0] }, { shouldFocus: index === 0 }),
    )
    if (invalid.length === 0) setServerError(result.error.message)
  })

  return (
    <form
      onSubmit={save}
      noValidate
      className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_380px]"
    >
      <div className="grid gap-5">
        {serverError ? (
          <p
            role="alert"
            className="rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2.5 text-sm text-destructive"
          >
            {serverError}
          </p>
        ) : null}

        <Section id="company-data" title="Datos" description="Como figuran en SUNAT.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              id="company-legal-name"
              label="Razón social"
              error={errors.legal_name?.message}
              className="sm:col-span-2"
            >
              <Input
                {...describedBy('company-legal-name', errors.legal_name)}
                maxLength={200}
                autoComplete="organization"
                {...register('legal_name')}
              />
            </Field>
            <Field
              id="company-trade-name"
              label="Nombre comercial"
              optional
              error={errors.trade_name?.message}
            >
              <Input
                {...describedBy('company-trade-name', errors.trade_name)}
                maxLength={120}
                {...register('trade_name')}
              />
            </Field>
            <Field id="company-ruc" label="RUC" error={errors.ruc?.message}>
              <Input
                {...describedBy('company-ruc', errors.ruc)}
                inputMode="numeric"
                maxLength={11}
                className="font-mono"
                {...register('ruc')}
              />
            </Field>
          </div>
        </Section>

        <Section id="company-contact" title="Contacto">
          <Field id="company-address" label="Dirección" error={errors.address?.message}>
            <Input
              {...describedBy('company-address', errors.address)}
              maxLength={300}
              autoComplete="street-address"
              {...register('address')}
            />
          </Field>
          <fieldset className="grid gap-2">
            <legend className="mb-1.5 text-sm font-medium">Teléfonos</legend>
            {phones.fields.map((field, index) => {
              const id = `company-phone-${index}`
              const error = errors.phones?.[index]?.number
              return (
                <div key={field.id} className="grid gap-1">
                  <div className="flex gap-2">
                    <Input
                      {...describedBy(id, error)}
                      aria-label={`Teléfono ${index + 1}`}
                      inputMode="tel"
                      maxLength={20}
                      {...register(`phones.${index}.number`)}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Quitar teléfono ${index + 1}`}
                      onClick={() => phones.remove(index)}
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  </div>
                  <ErrorText id={id} error={error?.message} />
                </div>
              )
            })}
            {phonesError ? (
              <p className="text-xs font-medium text-destructive">{phonesError}</p>
            ) : null}
            {phones.fields.length < PHONE_LIMIT ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="justify-self-start"
                onClick={() => phones.append({ number: '' })}
              >
                <Plus aria-hidden />
                Añadir teléfono
              </Button>
            ) : null}
          </fieldset>
          <Field id="company-email" label="Correo" optional error={errors.email?.message}>
            <Input
              {...describedBy('company-email', errors.email)}
              type="email"
              maxLength={254}
              autoComplete="email"
              {...register('email')}
            />
          </Field>
        </Section>

        <Section
          id="company-terms"
          title="Condiciones"
          description="Salen en los términos de cada proforma."
        >
          <Field
            id="company-payment-terms"
            label="Condición de pago"
            optional
            error={errors.payment_terms?.message}
          >
            <Textarea
              {...describedBy('company-payment-terms', errors.payment_terms)}
              maxLength={500}
              className="min-h-16 bg-card px-3"
              {...register('payment_terms')}
            />
          </Field>
          <Field
            id="company-return-policy"
            label="Política de devoluciones"
            optional
            error={errors.return_policy?.message}
          >
            <Textarea
              {...describedBy('company-return-policy', errors.return_policy)}
              maxLength={500}
              className="min-h-16 bg-card px-3"
              {...register('return_policy')}
            />
          </Field>
          <Field
            id="company-validity"
            label="Validez de la oferta (días)"
            error={errors.default_validity_days?.message}
            className="max-w-56"
          >
            <Input
              {...describedBy('company-validity', errors.default_validity_days)}
              inputMode="numeric"
              maxLength={3}
              {...register('default_validity_days')}
            />
          </Field>
        </Section>

        <Section
          id="company-payments"
          title="Pagos"
          description="Cuentas y números donde tus clientes pagan."
        >
          <fieldset className="grid gap-3">
            <legend className="mb-1.5 text-sm font-medium">Cuentas bancarias</legend>
            {accounts.fields.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aún no hay cuentas.</p>
            ) : null}
            {accounts.fields.map((field, index) => {
              const n = index + 1
              const error = errors.bank_accounts?.[index]
              return (
                <div
                  key={field.id}
                  role="group"
                  aria-label={`Cuenta ${n}`}
                  className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2"
                >
                  <Field
                    id={`company-bank-${index}`}
                    label={`Banco de la cuenta ${n}`}
                    error={error?.bank?.message}
                  >
                    <Input
                      {...describedBy(`company-bank-${index}`, error?.bank)}
                      maxLength={60}
                      placeholder="Por ejemplo, BCP"
                      {...register(`bank_accounts.${index}.bank`)}
                    />
                  </Field>
                  <Field
                    id={`company-account-${index}`}
                    label={`Número de cuenta ${n}`}
                    error={error?.account?.message}
                  >
                    <Input
                      {...describedBy(`company-account-${index}`, error?.account)}
                      inputMode="numeric"
                      maxLength={30}
                      className="font-mono"
                      {...register(`bank_accounts.${index}.account`)}
                    />
                  </Field>
                  <Field
                    id={`company-cci-${index}`}
                    label={`CCI de la cuenta ${n}`}
                    error={error?.cci?.message}
                  >
                    <Input
                      {...describedBy(`company-cci-${index}`, error?.cci)}
                      inputMode="numeric"
                      maxLength={30}
                      className="font-mono"
                      {...register(`bank_accounts.${index}.cci`)}
                    />
                  </Field>
                  <Field
                    id={`company-holder-${index}`}
                    label={`Titular de la cuenta ${n}`}
                    optional
                    error={error?.holder?.message}
                  >
                    <Input
                      {...describedBy(`company-holder-${index}`, error?.holder)}
                      maxLength={200}
                      placeholder="La razón social"
                      {...register(`bank_accounts.${index}.holder`)}
                    />
                  </Field>
                  <div className="flex gap-1 sm:col-span-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Subir cuenta ${n}`}
                      disabled={index === 0}
                      onClick={() => accounts.move(index, index - 1)}
                    >
                      <ArrowUp aria-hidden />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Bajar cuenta ${n}`}
                      disabled={index === accounts.fields.length - 1}
                      onClick={() => accounts.move(index, index + 1)}
                    >
                      <ArrowDown aria-hidden />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label={`Quitar cuenta ${n}`}
                      className="ml-auto hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => accounts.remove(index)}
                    >
                      <Trash2 aria-hidden />
                      Quitar
                    </Button>
                  </div>
                </div>
              )
            })}
            {accounts.fields.length < ACCOUNT_LIMIT ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="justify-self-start"
                onClick={() => accounts.append({ bank: '', account: '', cci: '', holder: '' })}
              >
                <Plus aria-hidden />
                Añadir cuenta
              </Button>
            ) : null}
          </fieldset>

          <fieldset className="grid gap-3">
            <legend className="mb-1.5 text-sm font-medium">Yape y Plin</legend>
            {wallets.fields.map((field, index) => {
              const n = index + 1
              const id = `company-wallet-${index}`
              const error = errors.wallets?.[index]?.number
              return (
                <div key={field.id} className="grid gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <div
                      role="radiogroup"
                      aria-label={`Tipo del número ${n}`}
                      className="inline-flex rounded-lg border p-0.5"
                    >
                      {KIND_OPTIONS.map(([kind, label]) => (
                        <label
                          key={kind}
                          className="cursor-pointer rounded-md px-2.5 py-1.5 text-sm font-semibold has-checked:bg-primary has-checked:text-primary-foreground has-focus-visible:ring-3 has-focus-visible:ring-ring/50"
                        >
                          <input
                            type="radio"
                            value={kind}
                            className="sr-only"
                            {...register(`wallets.${index}.kind`)}
                          />
                          {label}
                        </label>
                      ))}
                    </div>
                    <Input
                      {...describedBy(id, error)}
                      aria-label={`Número ${n} de Yape o Plin`}
                      inputMode="numeric"
                      maxLength={11}
                      placeholder="987 654 321"
                      className="w-40"
                      {...register(`wallets.${index}.number`)}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Quitar número ${n}`}
                      onClick={() => wallets.remove(index)}
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  </div>
                  <ErrorText id={id} error={error?.message} />
                </div>
              )
            })}
            {wallets.fields.length < WALLET_LIMIT ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="justify-self-start"
                onClick={() => wallets.append({ kind: 'yape', number: '' })}
              >
                <Plus aria-hidden />
                Añadir número de Yape o Plin
              </Button>
            ) : null}
          </fieldset>
        </Section>

        <div className="flex justify-end">
          <Button type="submit" disabled={isSubmitting}>
            Guardar cambios
          </Button>
        </div>
      </div>

      <CompanyPreview values={live} />
    </form>
  )
}
