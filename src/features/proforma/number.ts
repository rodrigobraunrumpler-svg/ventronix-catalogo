// N° 0001: cuatro cifras con ceros a la izquierda, y más cuando haga falta (spec §6.3).
export const formatProformaNumber = (value: number) => `N° ${String(value).padStart(4, '0')}`
