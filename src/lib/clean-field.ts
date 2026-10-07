import type { UseFormRegisterReturn } from 'react-hook-form'

// Un campo de React Hook Form que limpia lo escrito antes de guardarlo (un número no admite letras).
// Se usa donde se registra el campo: el orden de registro decide a qué error va el foco.
export function cleanField<T extends string>(
  field: UseFormRegisterReturn<T>,
  clean: (value: string) => string,
): UseFormRegisterReturn<T> {
  return {
    ...field,
    onChange: (event) => {
      event.target.value = clean(event.target.value)
      return field.onChange(event)
    },
  }
}
