import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useLimaToday } from '@/features/proforma/history/hooks'

afterEach(() => vi.useRealTimers())

describe('useLimaToday', () => {
  it('cambia de día a la medianoche de Lima aunque la pantalla siga abierta', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-10T04:59:30Z')) // 23:59:30 del 9 de octubre en Lima
    const { result } = renderHook(() => useLimaToday())
    expect(result.current).toBe('2026-10-09')
    act(() => vi.advanceTimersByTime(60_000))
    expect(result.current).toBe('2026-10-10')
  })

  it('al volver a la pestaña toma el día de hoy', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-09T15:00:00Z'))
    const { result } = renderHook(() => useLimaToday())
    vi.setSystemTime(new Date('2026-10-11T15:00:00Z'))
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(result.current).toBe('2026-10-11')
  })
})
