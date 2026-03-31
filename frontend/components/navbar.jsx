"use client"

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { useAccount, useConnect, useDisconnect, useSwitchChain } from 'wagmi'

function formatAddress(address) {
  if (!address) return ''
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

function Chevron({ open }) {
  return (
    <span
      className={`text-xs text-slate-500 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
      aria-hidden="true"
    >
      v
    </span>
  )
}

function Dropdown({ label, items, align = 'left', danger = false }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function handleClickOutside(event) {
      if (ref.current && !ref.current.contains(event.target)) {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex h-11 items-center gap-2 rounded-2xl border border-white/70 bg-white px-4 text-sm font-semibold text-slate-900 shadow-[0_14px_35px_rgba(15,23,42,0.16)] transition hover:-translate-y-0.5 hover:shadow-[0_18px_45px_rgba(15,23,42,0.2)]"
      >
        <span>{label}</span>
        <Chevron open={open} />
      </button>

      {open && (
        <div
          className={`absolute top-[calc(100%+10px)] z-30 min-w-full overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_24px_60px_rgba(15,23,42,0.2)] ${align === 'right' ? 'right-0' : 'left-0'}`}
        >
          {items.length ? (
            items.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => {
                  setOpen(false)
                  item.onClick()
                }}
                className={`flex w-full items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold transition hover:bg-slate-100 ${danger ? 'text-red-500 hover:bg-red-50' : 'text-slate-800'}`}
              >
                {item.label}
              </button>
            ))
          ) : (
            <div className="px-4 py-2 text-center text-sm font-medium text-slate-400">
              No options
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function Navbar() {
  const { address, isConnected, chain } = useAccount()
  const { connect, connectors, isPending } = useConnect()
  const { disconnect } = useDisconnect()
  const { switchChain, chains } = useSwitchChain()
  const pathname = usePathname()

  const connector = connectors[0]
  const currentChainLabel = chain?.name?.split(' ').slice(0, 2).join(' ') ?? 'Select network'
  const chainItems = chains
    .filter((item) => item.id !== chain?.id)
    .map((item) => ({
      label: item.name,
      onClick: () => switchChain({ chainId: item.id }),
    }))
  const navItems = [
    { href: '/', label: 'Cities' },
    { href: '/heroes', label: 'Heroes' },
  ]

  return (
    <nav className="flex w-full items-center justify-between gap-4 py-3">
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#0f766e,#14b8a6_55%,#99f6e4)] text-lg font-black text-white shadow-[0_18px_35px_rgba(20,184,166,0.35)]">
          C
        </div>
        <div>
          <div className="text-xl font-black tracking-tight text-white">Block Empire</div>
          <div className="text-sm text-slate-400">Build, attack and earn</div>
        </div>
      </div>

      <div className="hidden items-center gap-2 rounded-2xl border border-white/10 bg-white/5 p-1 md:flex">
        {navItems.map((item) => {
          const active = pathname === item.href
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                active ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-300 hover:bg-white/10 hover:text-white'
              }`}
            >
              {item.label}
            </Link>
          )
        })}
      </div>

      {isConnected ? (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Dropdown label={currentChainLabel} items={chainItems} />
          <Dropdown
            label={formatAddress(address)}
            items={[{ label: 'Disconnect', onClick: () => disconnect() }]}
            align="right"
            danger
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => connector && connect({ connector })}
          disabled={!connector || isPending}
          className="h-11 rounded-xl bg-blue-500 px-6 text-sm font-semibold text-white shadow-[0_18px_35px_rgba(59,130,246,0.35)] transition hover:-translate-y-0.5 hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isPending ? 'Connecting...' : 'Connect Wallet'}
        </button>
      )}
    </nav>
  )
}
