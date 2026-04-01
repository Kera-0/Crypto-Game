'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { HamsterAvatar, type HeroSnapshot } from './HamsterAvatar'

// ── Config ────────────────────────────────────────────────────────────────
const CARD_W = 128
const CARD_GAP = 10
const CARD_STEP = CARD_W + CARD_GAP
const RIBBON_TOTAL = 42
const WINNER_IDX = 33

// Weighted rarity: 55 / 22 / 13 / 7 / 3  (≥4 maps to 3 since contract has 0-3)
const RARITY_WEIGHTS = [55, 22, 13, 7, 3]
function pickRarity() {
  const r = Math.random() * 100
  let s = 0
  for (let i = 0; i < RARITY_WEIGHTS.length; i++) {
    s += RARITY_WEIGHTS[i]!
    if (r < s) return Math.min(i, 3)
  }
  return 0
}

let _seed = 50_000
function filler(): HeroSnapshot {
  const s = ++_seed
  return {
    id: BigInt(s),
    rarity: pickRarity(),
    total: {
      atk: ((s * 7) % 45) + 5,
      def_: ((s * 11) % 45) + 5,
      hp: ((s * 13) % 45) + 5,
      agi: ((s * 17) % 45) + 5,
      lck: ((s * 19) % 45) + 5,
    },
  }
}

const RARITY_NAMES = ['Common', 'Rare', 'Epic', 'Legendary']
const RARITY_COLORS = ['#94a3b8', '#38bdf8', '#a855f7', '#facc15']

// ── Component ─────────────────────────────────────────────────────────────
export function PackOpeningModal({
  winner,
  onClose,
}: {
  winner: HeroSnapshot | null
  onClose: () => void
}) {
  const vpRef = useRef<HTMLDivElement>(null)
  const ribbonRef = useRef<HTMLDivElement>(null)
  const [phase, setPhase] = useState<'spinning' | 'done'>('spinning')

  // Generate ribbon with winner already placed at WINNER_IDX
  // winner is guaranteed non-null when modal opens (button disabled until hero arrives)
  const ribbonItems = useMemo<HeroSnapshot[]>(() => {
    const list: HeroSnapshot[] = []
    for (let i = 0; i < RIBBON_TOTAL; i++) {
      list.push(i === WINNER_IDX && winner ? winner : filler())
    }
    return list
  }, [winner]) // eslint-disable-line react-hooks/exhaustive-deps

  const winnerHero = winner ?? ribbonItems[WINNER_IDX]!

  useEffect(() => {
    const vp = vpRef.current
    const ribbon = ribbonRef.current
    if (!vp || !ribbon) return

    const vpW = vp.offsetWidth
    const center = vpW / 2

    // Start: item 1–2 visible at center
    const startX = center - (1.5 * CARD_STEP + CARD_W / 2)
    // End: winner centered (small jitter for realism)
    const jitter = (Math.random() - 0.5) * 30
    const endX = center - (WINNER_IDX * CARD_STEP + CARD_W / 2 + jitter)

    // Set initial (no animation)
    ribbon.style.transition = 'none'
    ribbon.style.transform = `translateX(${startX}px)`

    // Kick off scroll on next paint
    const raf1 = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        ribbon.style.transition = 'transform 5.6s cubic-bezier(0.07, 0.5, 0.15, 1)'
        ribbon.style.transform = `translateX(${endX}px)`
      })
    })

    const t = setTimeout(() => setPhase('done'), 6200)
    return () => {
      cancelAnimationFrame(raf1)
      clearTimeout(t)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const rar = Math.min(winnerHero.rarity, 3)
  const rColor = RARITY_COLORS[rar] ?? RARITY_COLORS[0]!
  const rName = RARITY_NAMES[rar] ?? RARITY_NAMES[0]!

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div
        className="w-full max-w-xl rounded-[28px] border border-white/10 bg-slate-950 p-6 shadow-[0_30px_100px_rgba(0,0,0,0.8)]"
        style={{ boxShadow: phase === 'done' ? `0 30px 100px ${rColor}33, 0 0 0 1px rgba(255,255,255,0.07)` : undefined }}
      >
        <h2 className="text-center text-2xl font-black text-white tracking-tight">
          {phase === 'done' ? '🎉 Твой хомяк!' : '🎰 Открываем набор...'}
        </h2>

        {/* ── Ribbon viewport ── */}
        <div
          ref={vpRef}
          className="relative mt-5 overflow-hidden rounded-2xl bg-black/30"
          style={{ height: 158 }}
        >
          {/* Center selector */}
          <div
            className="pointer-events-none absolute inset-y-2 left-1/2 z-20 -translate-x-1/2 rounded-[18px]"
            style={{
              width: CARD_W + 8,
              border: `2.5px solid ${phase === 'done' ? rColor : '#facc15'}`,
              boxShadow: phase === 'done'
                ? `0 0 30px ${rColor}, inset 0 0 12px ${rColor}33`
                : '0 0 20px rgba(250,204,21,0.55)',
              transition: 'border-color 0.5s, box-shadow 0.5s',
            }}
          />

          {/* Ribbon */}
          <div
            ref={ribbonRef}
            className="flex items-center py-2"
            style={{ gap: CARD_GAP, willChange: 'transform' }}
          >
            {ribbonItems.map((hero, i) => {
              const isWinner = i === WINNER_IDX
              return (
                <div
                  key={i}
                  className="shrink-0 overflow-hidden rounded-[16px]"
                  style={{
                    width: CARD_W,
                    height: 138,
                    opacity: phase === 'done' && !isWinner ? 0.22 : 1,
                    transform: phase === 'done' && isWinner ? 'scale(1.07)' : 'scale(1)',
                    transition: 'opacity 0.5s, transform 0.5s',
                    boxShadow: phase === 'done' && isWinner ? `0 0 18px ${rColor}` : 'none',
                  }}
                >
                  <HamsterAvatar hero={hero} size={CARD_W} />
                </div>
              )
            })}
          </div>

          {/* Edge fades */}
          <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-24 bg-gradient-to-r from-slate-950 to-transparent" />
          <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-24 bg-gradient-to-l from-slate-950 to-transparent" />
        </div>

        {/* ── Winner reveal ── */}
        {phase === 'done' && (
          <div className="mt-6 flex flex-col items-center gap-4">
            <div
              className="overflow-hidden rounded-[24px]"
              style={{ boxShadow: `0 0 70px ${rColor}55, 0 0 120px ${rColor}22` }}
            >
              <HamsterAvatar hero={winnerHero} size={190} />
            </div>
            <p className="text-xl font-black" style={{ color: rColor }}>
              {rName} · Хомяк #{winnerHero.id.toString()}
            </p>
            <div className="flex gap-3 text-xs text-slate-400">
              {(['atk', 'def_', 'hp', 'agi', 'lck'] as const).map((s) => (
                <span key={s} className="rounded-full bg-white/5 px-3 py-1 font-semibold uppercase tracking-wider">
                  {s.replace('_', '')} {winnerHero.total[s]}
                </span>
              ))}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="mt-1 rounded-2xl bg-teal-400 px-10 py-3 text-sm font-black text-slate-950 transition hover:-translate-y-0.5 hover:bg-teal-300"
            >
              Добавить в отряд
            </button>
          </div>
        )}

        {phase === 'spinning' && (
          <p className="mt-4 text-center text-sm text-slate-500 animate-pulse">
            Определяем вашего хомяка...
          </p>
        )}
      </div>
    </div>
  )
}
