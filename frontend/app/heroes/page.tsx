'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { formatUnits, stringToHex, type PublicClient } from 'viem'
import { useAccount, usePublicClient, useReadContract, useWaitForTransactionReceipt, useWriteContract } from 'wagmi'
import { Navbar } from '@/components/navbar'
import { HamsterAvatar, RARITY_THEMES } from '@/components/HamsterAvatar'
import { PackOpeningModal } from '@/components/PackOpeningModal'
import type { HeroSnapshot } from '@/components/HamsterAvatar'
import {
  HERO_CURRENCY_ADDRESS,
  HERO_NFT_ADDRESS,
  PACK_OPENER_ADDRESS,
  heroNftAbi,
  isConfiguredAddress,
  packOpenerAbi,
  tokenAbi,
} from '@/lib/contracts'

type StatBlock = {
  atk: number
  def_: number
  hp: number
  agi: number
  lck: number
}

type HeroCardData = {
  id: bigint
  rarity: number
  base: StatBlock
  bonus: StatBlock
  total: StatBlock
  level: number
  xp: number
  upgradesThisLevel: number
}

const rarityMeta = [
  { name: 'Common', accent: '#94a3b8', glow: 'rgba(148,163,184,0.22)' },
  { name: 'Rare', accent: '#38bdf8', glow: 'rgba(56,189,248,0.22)' },
  { name: 'Epic', accent: '#f97316', glow: 'rgba(249,115,22,0.22)' },
  { name: 'Legendary', accent: '#facc15', glow: 'rgba(250,204,21,0.24)' },
] as const

const modules = [
  { value: 0, label: 'Blade', stat: 'ATK', requirement: 1 },
  { value: 1, label: 'Armor', stat: 'DEF', requirement: 2 },
  { value: 2, label: 'Reactor', stat: 'HP', requirement: 3 },
  { value: 3, label: 'Stabilizer', stat: 'AGI', requirement: 4 },
  { value: 4, label: 'Luck Crystal', stat: 'LCK', requirement: 5 },
] as const

const statLabels: Array<keyof StatBlock> = ['atk', 'def_', 'hp', 'agi', 'lck']

function short(address?: string) {
  if (!address) return ''
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

function formatCurrency(value?: bigint) {
  if (value === undefined) return '0'
  return formatUnits(value, 18)
}

function xpForNextLevel(level: number) {
  return 100 * level * level
}

function extractErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return 'Transaction failed.'
}

function formatActionError(error: unknown) {
  const message = extractErrorMessage(error)
  const normalized = message.toLowerCase()

  if (normalized.includes('user rejected') || normalized.includes('user denied')) {
    return 'The transaction was cancelled in your wallet.'
  }

  if (normalized.includes('out of gas') || normalized.includes('internal error')) {
    return 'Hardhat Local rejected the default gas settings for this transaction. Gas is now estimated automatically, so try the action again.'
  }

  if (
    normalized.includes('insufficient') ||
    normalized.includes('spendfrom') ||
    normalized.includes('spend from') ||
    normalized.includes('currency') ||
    normalized.includes('exceeds balance')
  ) {
    return 'Not enough hero currency for this action yet. Claim Free Tokens and try again.'
  }

  return message
}

function normalizeStats(stats: readonly [number, number, number, number, number] | StatBlock): StatBlock {
  if (Array.isArray(stats)) {
    return {
      atk: Number(stats[0]),
      def_: Number(stats[1]),
      hp: Number(stats[2]),
      agi: Number(stats[3]),
      lck: Number(stats[4]),
    }
  }

  const namedStats = stats as StatBlock

  return {
    atk: Number(namedStats.atk),
    def_: Number(namedStats.def_),
    hp: Number(namedStats.hp),
    agi: Number(namedStats.agi),
    lck: Number(namedStats.lck),
  }
}

async function fetchOwnedHeroes(
  publicClient: PublicClient,
  owner: `0x${string}`,
  nextHeroId: bigint,
): Promise<HeroCardData[]> {
  const maxId = Number(nextHeroId) - 1
  if (maxId <= 0) return []

  const ownedIds: bigint[] = []

  for (let index = 1; index <= maxId; index += 1) {
    try {
      const tokenOwner = (await publicClient.readContract({
        address: HERO_NFT_ADDRESS,
        abi: heroNftAbi,
        functionName: 'ownerOf',
        args: [BigInt(index)],
      })) as `0x${string}`

      if (tokenOwner.toLowerCase() === owner.toLowerCase()) {
        ownedIds.push(BigInt(index))
      }
    } catch {
      continue
    }
  }

  if (!ownedIds.length) return []

  const heroes: HeroCardData[] = []

  for (const id of ownedIds) {
    try {
      const heroData = await publicClient.readContract({
        address: HERO_NFT_ADDRESS,
        abi: heroNftAbi,
        functionName: 'hero',
        args: [id],
      })

      const totalStats = await publicClient.readContract({
        address: HERO_NFT_ADDRESS,
        abi: heroNftAbi,
        functionName: 'totalStats',
        args: [id],
      })

      heroes.push({
      id,
      rarity: Number(heroData.rarity),
      base: normalizeStats(heroData.base),
      bonus: normalizeStats(heroData.bonus),
      total: normalizeStats(totalStats),
      level: Number(heroData.prog.level),
      xp: Number(heroData.prog.xp),
      upgradesThisLevel: Number(heroData.prog.upgradesThisLevel),
      })
    } catch {
      continue
    }
  }

  return heroes
}

export default function HeroesPage() {
  const { address, isConnected, chain } = useAccount()
  const publicClient = usePublicClient()
  const { writeContractAsync } = useWriteContract()
  const [heroes, setHeroes] = useState<HeroCardData[]>([])
  const [isLoadingHeroes, setIsLoadingHeroes] = useState(false)
  const [selectedHeroId, setSelectedHeroId] = useState<bigint | null>(null)
  const [selectedModule, setSelectedModule] = useState('0')
  const [tournamentSlug, setTournamentSlug] = useState('alpha-cup')
  const [status, setStatus] = useState('Ready to sync hero contracts.')
  const [hash, setHash] = useState<`0x${string}` | undefined>()
  const [packModalOpen, setPackModalOpen] = useState(false)
  const [packPurchased, setPackPurchased] = useState(false)
  const [packWinner, setPackWinner] = useState<HeroSnapshot | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const heroIdsBeforeRef = useRef<Set<string>>(new Set())
  const packPendingRef = useRef(false)

  const heroContractsReady = isConfiguredAddress(HERO_NFT_ADDRESS)
  const packContractsReady = isConfiguredAddress(PACK_OPENER_ADDRESS)
  const heroCurrencyReady = isConfiguredAddress(HERO_CURRENCY_ADDRESS)

  const { data: tokenBalance, refetch: refetchBalance } = useReadContract({
    address: HERO_CURRENCY_ADDRESS,
    abi: tokenAbi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address && heroCurrencyReady },
  })

  const { data: packPrice } = useReadContract({
    address: PACK_OPENER_ADDRESS,
    abi: packOpenerAbi,
    functionName: 'packPrice',
    query: { enabled: packContractsReady },
  })

  const { data: heroBalance } = useReadContract({
    address: HERO_NFT_ADDRESS,
    abi: heroNftAbi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address && heroContractsReady },
  })

  const { data: nextHeroId, refetch: refetchNextHeroId } = useReadContract({
    address: HERO_NFT_ADDRESS,
    abi: heroNftAbi,
    functionName: 'nextId',
    query: { enabled: heroContractsReady },
  })

  const { isLoading: txPending } = useWaitForTransactionReceipt({
    hash,
    query: { enabled: !!hash },
  })

  async function loadHeroes(nextHeroIdOverride?: bigint) {
    const resolvedNextHeroId = nextHeroIdOverride ?? nextHeroId

    if (!publicClient || !address || !heroContractsReady || !resolvedNextHeroId) {
      setHeroes([])
      setSelectedHeroId(null)
      return
    }

    setIsLoadingHeroes(true)
    setStatus('Syncing your hero roster from chain...')

    try {
      const nextHeroes = await fetchOwnedHeroes(publicClient, address, resolvedNextHeroId)

      if (!nextHeroes.length) {
        setHeroes([])
        setSelectedHeroId(null)
        setStatus('No heroes found for this wallet yet.')
        return
      }

      setHeroes(nextHeroes)
      setSelectedHeroId((current) => {
        if (current && nextHeroes.some((hero) => hero.id === current)) return current
        return nextHeroes[0]?.id ?? null
      })
      setStatus(`Synced ${nextHeroes.length} hero${nextHeroes.length === 1 ? '' : 'es'} from chain.`)

      // If pack opening is pending вЂ” find the new hero and set as winner
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to load hero roster.')
    } finally {
      setIsLoadingHeroes(false)
    }
  }

  async function pollPackWinner(attempt = 0) {
    if (!publicClient || !address || !heroContractsReady || !packPendingRef.current) {
      return
    }

    try {
      const currentNextHeroId = (await publicClient.readContract({
        address: HERO_NFT_ADDRESS,
        abi: heroNftAbi,
        functionName: 'nextId',
      })) as bigint

      const nextHeroes = await fetchOwnedHeroes(publicClient, address, currentNextHeroId)
      const newHero = nextHeroes.find((hero) => !heroIdsBeforeRef.current.has(hero.id.toString()))

      if (newHero) {
        setPackWinner(newHero)
        setStatus('Pack is ready. Click "Open" to reveal your hamster.')
        return
      }
    } catch {
      // Keep polling while the chain resolves the purchased pack.
    }

    if (!packPendingRef.current) return

    if (attempt >= 20) {
      setStatus('Pack purchased. Waiting for the hero to arrive on-chain...')
      return
    }

    window.setTimeout(() => {
      void pollPackWinner(attempt + 1)
    }, 2000)
  }

  useEffect(() => {
    if (!publicClient || !address || !heroContractsReady || !nextHeroId) {
      setHeroes([])
      setSelectedHeroId(null)
      return
    }

    if (packPendingRef.current || packPurchased || packModalOpen) {
      return
    }

    const client = publicClient
    const owner = address
    const heroIdCeiling = nextHeroId
    let cancelled = false

    async function run() {
      setIsLoadingHeroes(true)
      setStatus('Syncing your hero roster from chain...')

      try {
        const nextHeroes = await fetchOwnedHeroes(client, owner, heroIdCeiling)
        if (cancelled) return

        if (!nextHeroes.length) {
          setHeroes([])
          setSelectedHeroId(null)
          setStatus('No heroes found for this wallet yet.')
          return
        }

        setHeroes(nextHeroes)
        setSelectedHeroId((current) => {
          if (current && nextHeroes.some((hero) => hero.id === current)) return current
          return nextHeroes[0]?.id ?? null
        })
        setStatus(`Synced ${nextHeroes.length} hero${nextHeroes.length === 1 ? '' : 'es'} from chain.`)
      } catch (error) {
        if (cancelled) return
        setStatus(error instanceof Error ? error.message : 'Failed to load hero roster.')
      } finally {
        if (!cancelled) setIsLoadingHeroes(false)
      }
    }

    void run()

    return () => {
      cancelled = true
    }
  }, [address, heroContractsReady, nextHeroId, packModalOpen, packPurchased, publicClient])

  async function buyPack() {
    if (!publicClient || !address || !packContractsReady) return

    setActionError(null)
    setHash(undefined)
    setStatus('Preparing pack purchase...')

    try {
      heroIdsBeforeRef.current = new Set(heroes.map((hero) => hero.id.toString()))
      packPendingRef.current = true
      setPackWinner(null)

      const simulation = await publicClient.simulateContract({
        account: address,
        address: PACK_OPENER_ADDRESS,
        abi: packOpenerAbi,
        functionName: 'buyPack',
        args: [],
      })

      const estimatedGas = await publicClient.estimateContractGas({
        account: address,
        address: PACK_OPENER_ADDRESS,
        abi: packOpenerAbi,
        functionName: 'buyPack',
        args: [],
      })

      const tx = await writeContractAsync({
        address: PACK_OPENER_ADDRESS,
        abi: packOpenerAbi,
        functionName: 'buyPack',
        args: [],
        // Hardhat Local can reject default gas for this call unless we send an explicit limit.
        gas: simulation.request.gas ?? (estimatedGas * 12n) / 10n,
      })

      setHash(tx)
      setPackPurchased(true)
      setStatus('Pack purchased. Waiting for the hero reveal...')
      window.setTimeout(() => {
        void refetchBalance()
        void pollPackWinner()
      }, 1500)
    } catch (error) {
      packPendingRef.current = false
      setPackPurchased(false)
      setPackWinner(null)
      setActionError(formatActionError(error))
      setStatus('Pack purchase failed.')
    }
  }

  async function claimHeroCurrency() {
    setActionError(null)
    setHash(undefined)

    try {
      const tx = await writeContractAsync({
        address: HERO_CURRENCY_ADDRESS,
        abi: tokenAbi,
        functionName: 'faucet',
        args: [BigInt(250) * BigInt(10) ** BigInt(18)],
      })

      setHash(tx)
      setStatus('Hero currency faucet sent. Refreshing balance...')
      window.setTimeout(refetchBalance, 1500)
    } catch (error) {
      setActionError(formatActionError(error))
      setStatus('Hero currency claim failed.')
    }
  }

  async function applyModule() {
    if (!selectedHeroId) return

    setActionError(null)
    setHash(undefined)

    try {
      const tx = await writeContractAsync({
        address: HERO_NFT_ADDRESS,
        abi: heroNftAbi,
        functionName: 'applyModule',
        args: [selectedHeroId, Number(selectedModule)],
      })

      setHash(tx)
      setStatus('Module transaction sent. Refreshing hero stats...')
      window.setTimeout(() => {
        void refetchNextHeroId()
        void loadHeroes()
      }, 1500)
    } catch (error) {
      setActionError(formatActionError(error))
      setStatus('Module upgrade failed.')
    }
  }

  async function enterTournament() {
    if (!selectedHeroId) return

    setActionError(null)
    setHash(undefined)

    try {
      const tx = await writeContractAsync({
        address: HERO_NFT_ADDRESS,
        abi: heroNftAbi,
        functionName: 'enterTournament',
        args: [selectedHeroId, stringToHex(tournamentSlug.slice(0, 32), { size: 32 })],
      })

      setHash(tx)
      setStatus(`Hero #${selectedHeroId.toString()} entered tournament ${tournamentSlug}.`)
    } catch (error) {
      setActionError(formatActionError(error))
      setStatus('Tournament entry failed.')
    }
  }

  const selectedHero = useMemo(
    () => heroes.find((hero) => hero.id === selectedHeroId) ?? null,
    [heroes, selectedHeroId],
  )

  const xpProgress = selectedHero ? Math.min(selectedHero.xp / xpForNextLevel(selectedHero.level), 1) : 0
  const upgradesLimit = selectedHero ? selectedHero.level + 2 : 0

  function handleOpenPack() {
    setPackPurchased(false)
    setPackModalOpen(true)
  }

  async function handleModalClose() {
    if (!publicClient) return

    setPackModalOpen(false)
    setPackWinner(null)
    packPendingRef.current = false
    const refreshedNextHeroId = (await publicClient.readContract({
      address: HERO_NFT_ADDRESS,
      abi: heroNftAbi,
      functionName: 'nextId',
    }).catch(() => undefined)) as bigint | undefined
    await loadHeroes(refreshedNextHeroId)
  }

  return (
    <>
    {packModalOpen && (
      <PackOpeningModal winner={packWinner} onClose={handleModalClose} />
    )}
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(20,184,166,0.18),transparent_28%),radial-gradient(circle_at_top_right,rgba(249,115,22,0.14),transparent_24%),linear-gradient(180deg,#07131a_0%,#0d1724_42%,#111827_100%)] px-4 py-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <Navbar />

        <section className="mt-6 overflow-hidden rounded-[28px] border border-white/10 bg-white/5 shadow-[0_30px_80px_rgba(0,0,0,0.28)] backdrop-blur">
          <div className="grid gap-8 px-6 py-8 lg:grid-cols-[1.15fr_0.85fr] lg:px-8">
            <div>
              <div className="inline-flex rounded-full border border-teal-300/20 bg-teal-300/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-teal-200">
                Hero NFT Hangar
              </div>
              <h1 className="mt-4 max-w-2xl text-4xl font-black tracking-tight text-white sm:text-5xl">
                Manage heroes, open packs, and send your roster into battle.
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-slate-300">
                This dashboard is wired to the on-chain hero contracts: it reads pack price, syncs NFT data, applies modules, and prepares tournament entries from your connected wallet.
              </p>

              <div className="mt-8 grid gap-4 sm:grid-cols-3">
                <MetricCard
                  label="Wallet"
                  value={isConnected ? short(address) : 'Not connected'}
                  hint={chain?.name ?? 'Connect MetaMask to continue'}
                />
                <MetricCard
                  label="Currency"
                  value={isConnected ? formatCurrency(tokenBalance) : '0'}
                  hint="In-game balance used for packs"
                />
                <MetricCard
                  label="Roster"
                  value={heroBalance !== undefined ? heroBalance.toString() : '0'}
                  hint="Hero NFTs owned by this wallet"
                />
              </div>
            </div>

            <div className="grid gap-4 rounded-[24px] border border-white/10 bg-slate-950/35 p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">Control Deck</div>
                  <div className="mt-2 text-2xl font-black text-white">Pack and hero actions</div>
                </div>
                <div className={`rounded-full px-3 py-1 text-xs font-semibold ${txPending ? 'bg-amber-400/15 text-amber-200' : 'bg-emerald-400/15 text-emerald-200'}`}>
                  {txPending ? 'Transaction pending' : 'Ready'}
                </div>
              </div>

              {!isConnected && (
                <Notice tone="amber">
                  Connect your wallet to start reading heroes and sending transactions.
                </Notice>
              )}

              {!heroContractsReady && (
                <Notice tone="amber">
                  Set <code>NEXT_PUBLIC_HERO_NFT_ADDRESS</code> and <code>NEXT_PUBLIC_PACK_OPENER_ADDRESS</code> in the frontend environment to enable the hero dashboard.
                </Notice>
              )}

              {!heroCurrencyReady && (
                <Notice tone="amber">
                  Set <code>NEXT_PUBLIC_HERO_CURRENCY_ADDRESS</code> to enable pack balance and local faucet.
                </Notice>
              )}

              {actionError && (
                <Notice tone="red">
                  <div className="font-semibold text-white">Action blocked</div>
                  <div>{actionError}</div>
                </Notice>
              )}

              {heroCurrencyReady && (
                <div className="grid gap-3 rounded-[24px] border border-emerald-300/15 bg-[linear-gradient(145deg,rgba(16,185,129,0.16),rgba(2,6,23,0.6))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm uppercase tracking-[0.18em] text-emerald-100/70">Hero currency</div>
                      <div className="text-lg font-bold text-white">Free tokens for packs</div>
                    </div>
                    <button
                      type="button"
                      onClick={claimHeroCurrency}
                      disabled={!isConnected || !heroCurrencyReady || txPending}
                      className="rounded-2xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Free Tokens
                    </button>
                  </div>
                  <div className="text-sm leading-6 text-slate-300">
                    Claim a local test balance before buying packs, listing heroes, or entering tournaments.
                  </div>
                </div>
              )}

              <div className="grid gap-4 rounded-[24px] border border-teal-300/15 bg-[linear-gradient(160deg,rgba(45,212,191,0.12),rgba(15,23,42,0.74))] p-5 shadow-[0_18px_40px_rgba(8,15,30,0.28)]">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm uppercase tracking-[0.18em] text-teal-100/70">Pack price</div>
                    <div className="text-2xl font-black text-white">
                      {packPrice !== undefined ? formatCurrency(packPrice) : '...'}
                    </div>
                    <div className="mt-2 max-w-xs text-sm leading-6 text-slate-300">
                      Buy a hero pack, wait for the chain to mint it, then reveal the hamster when it is ready.
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={buyPack}
                    disabled={!isConnected || !packContractsReady || txPending || packPurchased}
                    className="rounded-2xl bg-teal-400 px-5 py-3 text-sm font-black text-slate-950 transition hover:-translate-y-0.5 hover:bg-teal-300 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Buy Pack
                  </button>
                </div>

                {/* Drop chances */}
                <div className="grid grid-cols-5 gap-1.5 text-center">
                  {[
                    { label: 'Common',    pct: '55%', color: '#94a3b8' },
                    { label: 'Rare',      pct: '22%', color: '#38bdf8' },
                    { label: 'Epic',      pct: '13%', color: '#c084fc' },
                    { label: 'Legendary', pct: '7%',  color: '#facc15' },
                    { label: 'Mythic',    pct: '3%',  color: '#f87171' },
                  ].map(({ label, pct, color }) => (
                    <div key={label} className="rounded-xl bg-white/5 px-1 py-2">
                      <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color }}>{label}</div>
                      <div className="mt-1 text-base font-black text-white">{pct}</div>
                    </div>
                  ))}
                </div>

                {/* Open button only becomes active when the hero is ready */}
                {packPurchased && (
                  <div className="grid gap-2">
                    {!packWinner && (
                      <div className="flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 py-3 text-sm text-slate-400">
                        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                        </svg>
                        Waiting for the hero to arrive from the blockchain...
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={handleOpenPack}
                      disabled={!packWinner}
                      className="w-full rounded-2xl bg-yellow-400 py-4 text-lg font-black text-slate-950 transition hover:-translate-y-0.5 hover:bg-yellow-300 disabled:cursor-not-allowed disabled:opacity-40 animate-pulse disabled:animate-none"
                    >
                      Open Pack!
                    </button>
                  </div>
                )}
              </div>

              <div className="grid gap-3 rounded-[20px] border border-white/10 bg-black/20 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm text-slate-400">Roster sync</div>
                    <div className="text-lg font-bold text-white">Load heroes from chain</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      void loadHeroes()
                    }}
                    disabled={!isConnected || !heroContractsReady || isLoadingHeroes || packPurchased || packModalOpen}
                    className="rounded-2xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isLoadingHeroes ? 'Syncing...' : 'Refresh'}
                  </button>
                </div>
                <div className="text-sm leading-6 text-slate-300">{status}</div>
                {hash && (
                  <div className="break-all rounded-2xl border border-white/10 bg-slate-950/45 px-3 py-2 text-xs text-slate-400">
                    tx: {hash}
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="mt-6 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-[28px] border border-white/10 bg-slate-950/45 p-5 shadow-[0_24px_60px_rgba(0,0,0,0.25)]">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-400">Roster</div>
                <h2 className="mt-2 text-2xl font-black text-white">Your heroes</h2>
              </div>
              <div className="rounded-full bg-white/5 px-3 py-1 text-sm font-semibold text-slate-300">
                {heroes.length} loaded
              </div>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              {heroes.length === 0 && (
                <div className="rounded-[24px] border border-dashed border-white/15 bg-white/[0.03] p-6 text-sm leading-7 text-slate-400 md:col-span-2">
                  No hero NFTs loaded yet. Buy a pack, wait for VRF resolution, then refresh the roster.
                </div>
              )}

              {heroes.map((hero) => {
                const rarity = rarityMeta[hero.rarity] ?? rarityMeta[0]
                const rt = RARITY_THEMES[Math.min(hero.rarity, RARITY_THEMES.length - 1)] ?? RARITY_THEMES[0]!
                const isSelected = selectedHeroId === hero.id
                return (
                  <button
                    key={hero.id.toString()}
                    type="button"
                    onClick={() => setSelectedHeroId(hero.id)}
                    className="rounded-[24px] border p-5 text-left transition hover:-translate-y-1"
                    style={{
                      borderColor: rt.ring,
                      borderWidth: isSelected ? 2 : 1,
                      background: isSelected
                        ? `linear-gradient(160deg, ${rt.bg} 0%, rgba(8,12,24,0.97) 100%)`
                        : `linear-gradient(160deg, rgba(255,255,255,0.03) 0%, rgba(8,12,24,0.95) 100%)`,
                      boxShadow: isSelected
                        ? `0 0 0 3px ${rt.ring}44, 0 0 28px ${rt.glow}, 0 8px 32px rgba(0,0,0,0.6)`
                        : `0 0 10px ${rt.ring}22, inset 0 0 1px ${rt.ring}33`,
                    }}
                  >
                    <div className="flex items-center gap-4">
                      <div className="shrink-0 rounded-[16px] overflow-hidden" style={{ boxShadow: `0 0 18px ${rarity.glow}` }}>
                        <HamsterAvatar hero={hero} size={88} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-300">{rarity.name}</div>
                            <div className="mt-1 text-xl font-black text-white">Hero #{hero.id.toString()}</div>
                          </div>
                          <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-slate-200">
                            LVL {hero.level}
                          </div>
                        </div>
                        <div className="mt-3 grid grid-cols-5 gap-1 text-center">
                          {statLabels.map((stat) => (
                            <div key={stat} className="rounded-xl bg-black/20 px-1 py-2">
                              <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-400">
                                {stat.replace('_', '')}
                              </div>
                              <div className="mt-1 text-base font-black text-white">{hero.total[stat]}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 text-xs text-slate-400">
                      XP {hero.xp} / {xpForNextLevel(hero.level)} | Upgrades {hero.upgradesThisLevel} / {hero.level + 2}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          <aside className="rounded-[28px] border border-white/10 bg-slate-950/45 p-5 shadow-[0_24px_60px_rgba(0,0,0,0.25)]">
            <div className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-400">Operations</div>
            <h2 className="mt-2 text-2xl font-black text-white">
              {selectedHero ? `Hero #${selectedHero.id.toString()}` : 'Select a hero'}
            </h2>

            {selectedHero ? (
              <div className="mt-5 grid gap-5">
                <div className="flex justify-center">
                  <div
                    className="rounded-[24px] overflow-hidden"
                    style={{ boxShadow: `0 0 40px ${(RARITY_THEMES[Math.min(selectedHero.rarity, RARITY_THEMES.length-1)] ?? RARITY_THEMES[0]!).glow}` }}
                  >
                    <HamsterAvatar hero={selectedHero} size={160} />
                  </div>
                </div>
                <div className="rounded-[24px] border border-white/10 bg-black/20 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-400">Progress</div>
                    <div className="text-sm font-semibold text-slate-300">
                      {selectedHero.xp} / {xpForNextLevel(selectedHero.level)} XP
                    </div>
                  </div>
                  <div className="mt-3 h-3 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-[linear-gradient(90deg,#14b8a6,#22d3ee)]"
                      style={{ width: `${xpProgress * 100}%` }}
                    />
                  </div>
                  <div className="mt-3 text-sm text-slate-300">
                    Level {selectedHero.level}. Current per-level module budget: {selectedHero.upgradesThisLevel} / {upgradesLimit}.
                  </div>
                </div>

                <div className="rounded-[24px] border border-white/10 bg-black/20 p-4">
                  <div className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-400">Module Forge</div>
                  <div className="mt-4 grid gap-3">
                    <select
                      value={selectedModule}
                      onChange={(event) => setSelectedModule(event.target.value)}
                      className="rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-sm text-white outline-none"
                    >
                      {modules.map((module) => (
                        <option key={module.value} value={module.value}>
                          {module.label} | +{module.stat} | requires level {module.requirement}
                        </option>
                      ))}
                    </select>

                    <button
                      type="button"
                      onClick={applyModule}
                      disabled={!heroContractsReady || txPending}
                      className="rounded-2xl bg-orange-400 px-5 py-3 text-sm font-black text-slate-950 transition hover:-translate-y-0.5 hover:bg-orange-300 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Apply Module
                    </button>
                  </div>
                </div>

                <div className="rounded-[24px] border border-white/10 bg-black/20 p-4">
                  <div className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-400">Tournament</div>
                  <div className="mt-4 grid gap-3">
                    <input
                      value={tournamentSlug}
                      onChange={(event) => setTournamentSlug(event.target.value)}
                      maxLength={32}
                      className="rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-sm text-white outline-none"
                      placeholder="alpha-cup"
                    />
                    <button
                      type="button"
                      onClick={enterTournament}
                      disabled={!heroContractsReady || txPending || !tournamentSlug.trim()}
                      className="rounded-2xl border border-teal-300/20 bg-teal-300/10 px-5 py-3 text-sm font-black text-teal-100 transition hover:-translate-y-0.5 hover:bg-teal-300/20 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Enter Tournament
                    </button>
                  </div>
                </div>

                <div className="rounded-[24px] border border-white/10 bg-black/20 p-4">
                  <div className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-400">Stats breakdown</div>
                  <div className="mt-4 grid gap-3">
                    {statLabels.map((stat) => (
                      <div key={stat} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 text-sm">
                        <div className="font-semibold uppercase tracking-[0.18em] text-slate-400">{stat.replace('_', '')}</div>
                        <div className="rounded-full bg-white/5 px-3 py-1 text-slate-300">Base {selectedHero.base[stat]}</div>
                        <div className="rounded-full bg-emerald-400/10 px-3 py-1 text-emerald-200">Bonus +{selectedHero.bonus[stat]}</div>
                        <div className="rounded-full bg-white/10 px-3 py-1 font-bold text-white">Total {selectedHero.total[stat]}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-5 rounded-[24px] border border-dashed border-white/15 bg-white/[0.03] p-6 text-sm leading-7 text-slate-400">
                Select any hero from the roster to inspect stats, apply module upgrades, or send it to a tournament.
              </div>
            )}
          </aside>
        </section>
      </div>
    </main>
    </>
  )
}

function MetricCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-[22px] border border-white/10 bg-slate-950/45 p-4">
      <div className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">{label}</div>
      <div className="mt-3 text-2xl font-black text-white">{value}</div>
      <div className="mt-2 text-sm text-slate-400">{hint}</div>
    </div>
  )
}

function Notice({ children, tone }: { children: React.ReactNode; tone: 'amber' | 'blue' | 'red' }) {
  const classes =
    tone === 'amber'
      ? 'border-amber-300/20 bg-amber-300/10 text-amber-100'
      : tone === 'red'
        ? 'border-rose-300/20 bg-[linear-gradient(145deg,rgba(251,113,133,0.16),rgba(127,29,29,0.14))] text-rose-100'
        : 'border-sky-300/20 bg-sky-300/10 text-sky-100'

  return <div className={`rounded-[20px] border px-4 py-3 text-sm leading-6 ${classes}`}>{children}</div>
}
