import { tz } from '@date-fns/tz'
import { format } from 'date-fns'

// Las fechas de la app son las de Lima (UTC−5, sin horario de verano), también en el servidor:
// Vercel corre en UTC y, sin la zona, de 19:00 a 23:59 de Lima «hoy» sería el día siguiente. Con
// date-fns se pasa siempre como { in: lima }.
export const lima = tz('America/Lima')

// «02/10/2026»: el día de Lima de un instante (un Date o un texto ISO con hora).
export const formatDate = (instant: Date | string) =>
  format(new Date(instant), 'dd/MM/yyyy', { in: lima })
