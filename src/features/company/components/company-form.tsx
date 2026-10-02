'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import {
  Building2,
  Check,
  ChevronDown,
  ChevronUp,
  Landmark,
  LoaderCircle,
  Phone,
  Plus,
  Save,
  ScrollText,
  Trash2,
  X,
  type LucideIcon,
} from 'lucide-react'
import { Tabs } from 'radix-ui'
import { useState, type ReactNode } from 'react'
import { flushSync } from 'react-dom'
import { useFieldArray, useForm, useWatch, type FieldErrors, type FieldPath } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { RucLookupResult } from '@/features/proforma/ruc'
import type { ActionResult } from '@/lib/action-result'
import { digitsOnly, isValidRuc } from '@/lib/peru'
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

// Una sección a la vez, en pestañas: todo cabe en pantalla sin desplazarse. Cada pestaña sabe qué
// campos tiene, para marcar sus errores y llevar a ella al guardar.
const SECTIONS = [
  { value: 'datos', label: 'Datos', icon: Building2, fields: ['legal_name', 'trade_name', 'ruc'] },
  { value: 'contacto', label: 'Contacto', icon: Phone, fields: ['address', 'phones', 'email'] },
  {
    value: 'condiciones',
    label: 'Condiciones',
    icon: ScrollText,
    fields: ['payment_terms', 'return_policy', 'default_validity_days'],
  },
  { value: 'pagos', label: 'Pagos', icon: Landmark, fields: ['bank_accounts', 'wallets'] },
] as const satisfies readonly {
  value: string
  label: string
  icon: LucideIcon
  fields: readonly (keyof CompanyFormValues)[]
}[]

type Section = (typeof SECTIONS)[number]['value']

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

const PHONE_PATTERN = /^[\d +()-]{6,20}$/

function toFormValues(profile: CompanyProfile): CompanyFormValues {
  return {
    legal_name: profile.legal_name ?? '',
    trade_name: profile.trade_name ?? '',
    ruc: profile.ruc ?? '',
    address: profile.address ?? '',
    // Siempre hay al menos un teléfono a la vista: es obligatorio y el último no se puede quitar.
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

// Primer campo con error, en el orden de las pestañas.
function firstError(errors: FieldErrors<CompanyFormValues>) {
  for (const section of SECTIONS) {
    for (const field of section.fields) {
      const error = errors[field]
      if (!error) continue
      if (Array.isArray(error)) {
        const index = error.findIndex(Boolean)
        const key = index === -1 ? undefined : Object.keys(error[index] ?? {})[0]
        const path = key ? `${field}.${index}.${key}` : field
        return { section: section.value, path: path as FieldPath<CompanyFormValues> }
      }
      return { section: section.value, path: field }
    }
  }
  return null
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
  hint,
  className,
  children,
}: {
  id: string
  label: string
  error?: string
  optional?: boolean
  hint?: ReactNode
  className?: string
  children: ReactNode
}) {
  return (
    <div className={cn('grid content-start gap-1.5', className)}>
      <div className="flex items-center gap-2">
        <Label htmlFor={id} className="text-sm font-medium text-foreground">
          {label}
        </Label>
        {optional ? (
          <span className="rounded-full bg-muted px-2 text-xs text-muted-foreground">Opcional</span>
        ) : null}
      </div>
      {children}
      {error ? <ErrorText id={id} error={error} /> : hint}
    </div>
  )
}

// Cabecera de la pantalla: también la usan los estados de carga y error.
export function CompanyHeader({ children }: { children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="grid gap-1.5">
        <h1 className="text-[28px] leading-tight font-extrabold tracking-[-0.02em]">Empresa</h1>
        <p className="text-sm text-muted-foreground">
          Estos datos salen en tus proformas. Los cambios valen para las que generes después.
        </p>
      </div>
      {children ? <div className="flex flex-wrap items-center gap-3.5">{children}</div> : null}
    </div>
  )
}

type CompanyFormProps = {
  profile: CompanyProfile
  onSubmit: (values: CompanyInput) => Promise<ActionResult<CompanyProfile>>
  onSaved?: () => void
  // Consulta de RUC en SUNAT para rellenar razón social y dirección (la misma de la proforma).
  lookupRuc?: (ruc: string) => Promise<RucLookupResult>
  // Debajo de la vista previa: la tarjeta de WhatsApp, que no es parte del formulario.
  aside?: ReactNode
}

// Datos de la empresa (spec §6.2): pestañas con los errores marcados, guardar siempre a la vista y
// vista previa de cómo saldrán en la proforma.
export function CompanyForm({ profile, onSubmit, onSaved, lookupRuc, aside }: CompanyFormProps) {
  const [tab, setTab] = useState<Section>('datos')
  const [status, setStatus] = useState<'idle' | 'saved' | 'invalid'>('idle')
  const [serverError, setServerError] = useState<string | null>(null)
  const [rucLookup, setRucLookup] = useState<'idle' | 'loading' | 'filled'>('idle')
  const [lookedUp, setLookedUp] = useState<string | null>(null)
  const {
    register,
    control,
    handleSubmit,
    setError,
    setFocus,
    setValue,
    getValues,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm({
    resolver: zodResolver(companyProfileSchema),
    defaultValues: toFormValues(profile),
  })
  const phones = useFieldArray({ control, name: 'phones' })
  const accounts = useFieldArray({ control, name: 'bank_accounts' })
  const wallets = useFieldArray({ control, name: 'wallets' })
  const live = useWatch({ control })

  // Al guardar con errores, lleva a la pestaña del primer error y enfoca el campo. flushSync monta
  // la pestaña antes de enfocar.
  function showFirstError(formErrors: FieldErrors<CompanyFormValues>) {
    setStatus('invalid')
    const first = firstError(formErrors)
    if (!first) return
    if (first.section !== tab) flushSync(() => setTab(first.section))
    setFocus(first.path)
  }

  const save = handleSubmit(async (values) => {
    setServerError(null)
    const result = await onSubmit(values)
    if (result.ok) {
      reset(toFormValues(result.data))
      setStatus('saved')
      onSaved?.()
      return
    }
    const fieldErrors = result.error.fieldErrors ?? {}
    const invalid = SCALAR_FIELDS.filter((field) => fieldErrors[field]?.[0])
    invalid.forEach((field) => setError(field, { message: fieldErrors[field][0] }))
    if (invalid.length > 0) showFirstError(Object.fromEntries(invalid.map((field) => [field, {}])))
    else setServerError(result.error.message)
  }, showFirstError)

  // El RUC de la empresa trae de SUNAT la razón social y la dirección, sin pisar lo ya escrito.
  async function autofill(value: string) {
    const ruc = digitsOnly(value)
    if (!lookupRuc || !isValidRuc(ruc) || lookedUp === ruc) return
    setLookedUp(ruc)
    setRucLookup('loading')
    const result = await lookupRuc(ruc)
    if (digitsOnly(getValues('ruc') ?? '') !== ruc || result.kind !== 'found') {
      setRucLookup('idle')
      return
    }
    const options = { shouldDirty: true, shouldValidate: true }
    let filled = false
    if (!getValues('legal_name')?.trim()) {
      setValue('legal_name', result.company.legalName, options)
      filled = true
    }
    if (result.company.address && !getValues('address')?.trim()) {
      setValue('address', result.company.address, options)
      filled = true
    }
    setRucLookup(filled ? 'filled' : 'idle')
  }

  const errorsIn = (section: (typeof SECTIONS)[number]) =>
    section.fields.filter((field) => errors[field]).length
  const complete: Record<Section, boolean> = {
    datos: Boolean(live.legal_name?.trim()) && isValidRuc(digitsOnly(live.ruc ?? '')),
    contacto:
      Boolean(live.address?.trim()) &&
      (live.phones ?? []).some((phone) => PHONE_PATTERN.test(phone.number?.trim() ?? '')),
    condiciones: false,
    pagos: false,
  }
  const rucHint =
    rucLookup === 'loading' ? (
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
        Buscando en SUNAT…
      </p>
    ) : isValidRuc(digitsOnly(live.ruc ?? '')) ? (
      <p className="flex items-center gap-1.5 text-xs text-ring">
        <Check className="size-3.5" aria-hidden />
        {rucLookup === 'filled' ? 'RUC válido · datos de SUNAT' : 'RUC válido'}
      </p>
    ) : null

  const panel = 'grid content-start gap-4 p-5 outline-none'
  const listButton = 'justify-self-start'
  const removeButton =
    'size-10.5 shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive'

  return (
    // En pantallas muy anchas, el formulario y la vista previa no se separan.
    <form onSubmit={save} noValidate className="grid max-w-[1320px] gap-6">
      <CompanyHeader />

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Tabs.Root
          value={tab}
          onValueChange={(value) => setTab(value as Section)}
          className="min-w-0 overflow-clip rounded-[14px] border bg-card"
        >
          <Tabs.List
            aria-label="Secciones de los datos de la empresa"
            className="grid grid-cols-4 border-b sm:flex sm:px-2"
          >
            {SECTIONS.map((section) => {
              const Icon = section.icon
              const count = errorsIn(section)
              return (
                <Tabs.Trigger
                  key={section.value}
                  value={section.value}
                  className="relative flex h-15 flex-col items-center justify-center gap-1 px-1 text-xs font-semibold text-muted-foreground transition-colors outline-none after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset data-[state=active]:text-foreground data-[state=active]:after:bg-primary sm:h-12 sm:flex-row sm:gap-2 sm:px-3.5 sm:text-sm"
                >
                  <Icon className="size-4" aria-hidden />
                  <span className="inline-flex items-center gap-1.5">
                    {section.label}
                    {count > 0 ? (
                      <>
                        <span
                          aria-hidden
                          className="grid h-4.5 min-w-4.5 place-items-center rounded-full bg-destructive px-1 text-[11px] font-bold text-white"
                        >
                          {count}
                        </span>
                        <span className="sr-only">
                          , {count} {count === 1 ? 'campo' : 'campos'} por revisar
                        </span>
                      </>
                    ) : complete[section.value] ? (
                      <>
                        <Check className="size-3.5 text-ring" aria-hidden />
                        <span className="sr-only">, completo</span>
                      </>
                    ) : null}
                  </span>
                </Tabs.Trigger>
              )
            })}
          </Tabs.List>

          <Tabs.Content value="datos" className={cn(panel, 'sm:grid-cols-2')}>
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
                placeholder="Por ejemplo, Ventronix S.A.C."
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
                placeholder="Por ejemplo, Ventronix"
                {...register('trade_name')}
              />
            </Field>
            <Field id="company-ruc" label="RUC" error={errors.ruc?.message} hint={rucHint}>
              <Input
                {...describedBy('company-ruc', errors.ruc)}
                inputMode="numeric"
                maxLength={11}
                placeholder="11 dígitos"
                className="tabular-nums"
                {...register('ruc', { onChange: (event) => void autofill(event.target.value) })}
              />
            </Field>
          </Tabs.Content>

          <Tabs.Content value="contacto" className={panel}>
            <Field id="company-address" label="Dirección" error={errors.address?.message}>
              <Input
                {...describedBy('company-address', errors.address)}
                maxLength={300}
                autoComplete="street-address"
                placeholder="Calle, número, distrito y ciudad"
                {...register('address')}
              />
            </Field>
            <fieldset className="grid gap-2">
              <legend className="mb-1.5 text-sm font-medium text-foreground">Teléfonos</legend>
              {phones.fields.map((field, index) => {
                const id = `company-phone-${index}`
                const error = errors.phones?.[index]?.number
                return (
                  <div key={field.id} className="flex items-start gap-2">
                    <div className="grid flex-1 gap-1">
                      <Input
                        {...describedBy(id, error)}
                        aria-label={`Teléfono ${index + 1}`}
                        inputMode="tel"
                        maxLength={20}
                        placeholder="Por ejemplo, 987 654 321"
                        className="tabular-nums"
                        {...register(`phones.${index}.number`)}
                      />
                      <ErrorText id={id} error={error?.message} />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Quitar teléfono ${index + 1}`}
                      disabled={phones.fields.length === 1}
                      className={removeButton}
                      onClick={() => phones.remove(index)}
                    >
                      <X aria-hidden />
                    </Button>
                  </div>
                )
              })}
              {phones.fields.length < PHONE_LIMIT ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className={listButton}
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
                placeholder="ventas@tuempresa.pe"
                {...register('email')}
              />
            </Field>
          </Tabs.Content>

          <Tabs.Content value="condiciones" className={cn(panel, 'sm:grid-cols-2')}>
            <Field
              id="company-payment-terms"
              label="Condición de pago"
              optional
              error={errors.payment_terms?.message}
            >
              <Textarea
                {...describedBy('company-payment-terms', errors.payment_terms)}
                maxLength={500}
                placeholder="Por ejemplo, anticipo del 50 % antes de la entrega."
                className="min-h-22 bg-card px-3"
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
                placeholder="Por ejemplo, no se aceptan devoluciones una vez entregado el producto."
                className="min-h-22 bg-card px-3"
                {...register('return_policy')}
              />
            </Field>
            <Field
              id="company-validity"
              label="Validez por defecto de la oferta"
              error={errors.default_validity_days?.message}
            >
              <div className="flex items-center gap-2.5">
                <Input
                  {...describedBy('company-validity', errors.default_validity_days)}
                  inputMode="numeric"
                  maxLength={3}
                  className="w-20 text-center tabular-nums"
                  {...register('default_validity_days')}
                />
                <span className="text-sm">días</span>
              </div>
            </Field>
          </Tabs.Content>

          <Tabs.Content value="pagos" className={cn(panel, 'gap-5.5')}>
            <div className="grid gap-2.5">
              <h3 className="text-sm font-semibold text-foreground">Cuentas bancarias</h3>
              {accounts.fields.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aún no hay cuentas.</p>
              ) : null}
              {accounts.fields.map((field, index) => {
                const n = index + 1
                const error = errors.bank_accounts?.[index]
                const input = (
                  key: 'bank' | 'account' | 'cci' | 'holder',
                  label: string,
                  placeholder: string,
                  numeric = false,
                ) => {
                  const id = `company-${key}-${index}`
                  return (
                    <div className="grid content-start gap-1">
                      <Input
                        {...describedBy(id, error?.[key])}
                        aria-label={label}
                        placeholder={placeholder}
                        inputMode={numeric ? 'numeric' : undefined}
                        maxLength={key === 'holder' ? 200 : key === 'bank' ? 60 : 30}
                        className={numeric ? 'tabular-nums' : undefined}
                        {...register(`bank_accounts.${index}.${key}`)}
                      />
                      <ErrorText id={id} error={error?.[key]?.message} />
                    </div>
                  )
                }
                return (
                  <div
                    key={field.id}
                    role="group"
                    aria-label={`Cuenta ${n}`}
                    className="grid gap-3 rounded-xl border bg-[#fafbf8] p-3.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[13px] font-bold text-foreground">Cuenta {n}</span>
                      <div className="flex gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={`Subir cuenta ${n}`}
                          disabled={index === 0}
                          className="text-muted-foreground"
                          onClick={() => accounts.move(index, index - 1)}
                        >
                          <ChevronUp aria-hidden />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={`Bajar cuenta ${n}`}
                          disabled={index === accounts.fields.length - 1}
                          className="text-muted-foreground"
                          onClick={() => accounts.move(index, index + 1)}
                        >
                          <ChevronDown aria-hidden />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={`Quitar cuenta ${n}`}
                          className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => accounts.remove(index)}
                        >
                          <Trash2 aria-hidden />
                        </Button>
                      </div>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {input('bank', `Banco de la cuenta ${n}`, 'Banco (por ejemplo, BCP)')}
                      {input('account', `Número de cuenta ${n}`, 'Número de cuenta', true)}
                      {input('cci', `CCI de la cuenta ${n}`, 'CCI (20 dígitos)', true)}
                      {input(
                        'holder',
                        `Titular de la cuenta ${n}`,
                        'Titular (si no, la razón social)',
                      )}
                    </div>
                  </div>
                )
              })}
              {accounts.fields.length < ACCOUNT_LIMIT ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className={listButton}
                  onClick={() => accounts.append({ bank: '', account: '', cci: '', holder: '' })}
                >
                  <Plus aria-hidden />
                  Añadir cuenta
                </Button>
              ) : null}
            </div>

            <div className="grid gap-2.5">
              <h3 className="text-sm font-semibold text-foreground">Yape y Plin</h3>
              {wallets.fields.map((field, index) => {
                const n = index + 1
                const id = `company-wallet-${index}`
                const error = errors.wallets?.[index]?.number
                return (
                  <div key={field.id} className="flex flex-wrap items-start gap-2.5">
                    <div
                      role="radiogroup"
                      aria-label={`Tipo del número ${n}`}
                      className="inline-flex h-10.5 shrink-0 overflow-hidden rounded-[10px] border border-input bg-card"
                    >
                      {KIND_OPTIONS.map(([kind, label], option) => (
                        <label
                          key={kind}
                          className={cn(
                            'grid cursor-pointer place-items-center px-3.5 text-[13px] font-semibold text-foreground has-checked:bg-[#edf8df] has-focus-visible:ring-3 has-focus-visible:ring-ring/50 has-focus-visible:ring-inset',
                            option === 1 && 'border-x',
                          )}
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
                    <div className="grid min-w-40 flex-1 gap-1">
                      <Input
                        {...describedBy(id, error)}
                        aria-label={`Número ${n} de Yape o Plin`}
                        inputMode="tel"
                        maxLength={11}
                        placeholder="9 dígitos, empieza por 9"
                        className="tabular-nums"
                        {...register(`wallets.${index}.number`)}
                      />
                      <ErrorText id={id} error={error?.message} />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Quitar número ${n}`}
                      className={removeButton}
                      onClick={() => wallets.remove(index)}
                    >
                      <X aria-hidden />
                    </Button>
                  </div>
                )
              })}
              {wallets.fields.length < WALLET_LIMIT ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-label="Añadir número de Yape o Plin"
                  className={listButton}
                  onClick={() => wallets.append({ kind: 'yape', number: '' })}
                >
                  <Plus aria-hidden />
                  Añadir número
                </Button>
              ) : null}
            </div>
          </Tabs.Content>

          {/* Guardar va con el formulario: al pie de la tarjeta y, si la pestaña es larga, pegado al
              borde de la pantalla. Siempre a la vista y junto a los campos. */}
          <div className="sticky bottom-0 z-10 flex flex-wrap items-center gap-x-4 gap-y-2 border-t bg-card px-5 py-3.5">
            <Button type="submit" disabled={isSubmitting} className="max-sm:w-full">
              <Save aria-hidden />
              Guardar cambios
            </Button>
            {serverError ? (
              <span role="alert" className="text-[13px] font-semibold text-destructive">
                {serverError}
              </span>
            ) : status === 'invalid' && Object.keys(errors).length > 0 ? (
              <span role="alert" className="text-[13px] font-semibold text-destructive">
                Revisa los campos marcados.
              </span>
            ) : status === 'saved' && !isDirty ? (
              <span
                role="status"
                className="inline-flex items-center gap-1.5 text-[13px] text-ring"
              >
                <Check className="size-4" aria-hidden />
                Cambios guardados
              </span>
            ) : isDirty ? (
              <span className="text-[13px] text-muted-foreground">Cambios sin guardar</span>
            ) : null}
          </div>
        </Tabs.Root>

        <div className="grid gap-4">
          <CompanyPreview values={live} />
          {aside}
        </div>
      </div>
    </form>
  )
}
