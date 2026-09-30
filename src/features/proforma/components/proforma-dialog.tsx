'use client'

import { Check } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useCompanyProfile } from '@/features/company/hooks'
import { settle } from '@/lib/action-result'
import { useReturnFocus } from '@/lib/use-return-focus'
import { generateProformaDocument, reserveProformaNumber } from '../actions'
import { useCurrentPrices, useRucLookup } from '../hooks'
import { formatProformaNumber } from '../number'
import { firstPendingField, type CompanyStatus } from '../readiness'
import { useProforma } from '../store'
import { ProformaPanel } from './proforma-panel'

// Ventana centrada (pantalla completa en móvil); Esc la cierra (spec §4.3).
export function ProformaDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { draft } = useProforma()
  const company = useCompanyProfile()
  const prices = useCurrentPrices(
    draft.lines.map((line) => line.productId),
    open,
  )
  const lookupRuc = useRucLookup()
  const returnFocus = useReturnFocus(open, 'product-search')

  const companyStatus: CompanyStatus = company.isPending
    ? { status: 'loading' }
    : company.isError || !company.data
      ? { status: 'error' }
      : { status: 'ready', profile: company.data }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        {...returnFocus}
        onOpenAutoFocus={(event) => {
          // El foco entra en el primer campo pendiente (spec §4.3).
          const target = document.getElementById(firstPendingField(draft))
          if (target && !target.matches(':disabled')) {
            event.preventDefault()
            target.focus()
          }
        }}
        className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden rounded-2xl p-0 max-sm:h-dvh max-sm:max-h-dvh max-sm:max-w-none max-sm:rounded-none sm:max-w-[980px] has-[[data-view=ready]]:sm:max-w-[520px] [&:has([data-view=ready])_[data-slot=dialog-header]]:sr-only"
      >
        <DialogHeader className="gap-1 border-b px-6 pt-5 pr-14 pb-4">
          <DialogTitle className="text-lg font-bold">Completar proforma</DialogTitle>
          <DialogDescription className="flex items-center gap-1.5 text-[13px]">
            {/* El borrador se guarda en cada cambio (spec §4.5). */}
            <Check className="size-3.75 shrink-0 text-ring" aria-hidden />
            {draft.number ? `${formatProformaNumber(draft.number)} · ` : ''}
            Se guarda sola mientras la completas.
          </DialogDescription>
        </DialogHeader>
        <ProformaPanel
          company={companyStatus}
          prices={prices.data}
          lookupRuc={lookupRuc}
          reserveNumber={() => settle(reserveProformaNumber())}
          generatePdf={(input) => settle(generateProformaDocument(input))}
          onContinue={onClose}
          onFinish={onClose}
        />
      </DialogContent>
    </Dialog>
  )
}
