'use client'

import { useEffect, useMemo, useState } from 'react'
import { formatUnits, stringToHex, type PublicClient } from 'viem'
import { useAccount, usePublicClient, useReadContract, useWaitForTransactionReceipt, useWriteContract } from 'wagmi'
import { Navbar } from '@/components/navbar'
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

  return {
    atk: Number(stats.atk),
    def_: Number(stats.def_),
    hp: Number(stats.hp),
    agi: Number(stats.agi),
    lck: Number(stats.lck),
  }
}

async function fetchOwnedHeroes(
  publicClient: PublicClient,
  owner: `0x${string}`,
  nextHeroId: bigint,
): Promise<HeroCardData[]> {
  const maxId = Number(nextHeroId) - 1
  if (maxId <= 0) return []

  const ownershipChecks = await publicClient.multicall({
    contracts: Array.from({ length: maxId }, (_, index) => ({
      address: HERO_NFT_ADDRESS,
      abi: heroNftAbi,
      functionName: 'ownerOf',
      args: [BigInt(index + 1)],
    })),
    allowFailure: true,
  })

  const ownedIds = ownershipChecks.flatMap((item, index) => {
    if (item.status !== 'success') return []
    return item.result.toLowerCase() === owner.toLowerCase() ? [BigInt(index + 1)] : []
  })

  if (!ownedIds.length) return []

  const heroCalls = await publicClient.multicall({
    contracts: ownedIds.flatMap((id) => [
      {
        address: HERO_NFT_ADDRESS,
        abi: heroNftAbi,
        functionName: 'hero',
        args: [id],
      },
      {
        address: HERO_NFT_ADDRESS,
        abi: heroNftAbi,
        functionName: 'totalStats',
        args: [id],
      },
    ]),
  })

  const heroes: HeroCardData[] = []

  for (let index = 0; index < ownedIds.length; index += 1) {
    const heroResult = heroCalls[index * 2]
    const totalResult = heroCalls[index * 2 + 1]

    if (heroResult.status !== 'success' || totalResult.status !== 'success') continue

    const heroData = heroResult.result
    const totalStats = totalResult.result

    heroes.push({
      id: ownedIds[index],
      rarity: Number(heroData.rarity),
      base: normalizeStats(heroData.base),
      bonus: normalizeStats(heroData.bonus),
      total: normalizeStats(totalStats),
      level: Number(heroData.prog.level),
      xp: Number(heroData.prog.xp),
      upgradesThisLevel: Number(heroData.prog.upgradesThisLevel),
    })
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

  async function loadHeroes() {
    if (!publicClient || !address || !heroContractsReady || !nextHeroId) {
      setHeroes([])
      setSelectedHeroId(null)
      return
    }

    setIsLoadingHeroes(true)
    setStatus('Syncing your hero roster from chain...')

    try {
      const nextHeroes = await fetchOwnedHeroes(publicClient, address, nextHeroId)

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
      setStatus(error instanceof Error ? error.message : 'Failed to load hero roster.')
    } finally {
      setIsLoadingHeroes(false)
    }
  }

  useEffect(() => {
    if (!publicClient || !address || !heroContractsReady || !nextHeroId) {
      setHeroes([])
      setSelectedHeroId(null)
      return
    }

    let cancelled = false

    async function run() {
      setIsLoadingHeroes(true)
      setStatus('Syncing your hero roster from chain...')

      try {
        const nextHeroes = await fetchOwnedHeroes(publicClient, address, nextHeroId)
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
  }, [address, heroContractsReady, nextHeroId, publicClient])

  async function buyPack() {
    const tx = await writeContractAsync({
      address: PACK_OPENER_ADDRESS,
      abi: packOpenerAbi,
      functionName: 'buyPack',
      args: [],
    })

    setHash(tx)
    setStatus('Pack purchased. Waiting for VRF fulfillment to mint the hero...')
    setTimeout(() => {
      refetchBalance()
      refetchNextHeroId()
      loadHeroes()
    }, 4000)
  }

  async function claimHeroCurrency() {
    const tx = await writeContractAsync({
      address: HERO_CURRENCY_ADDRESS,
      abi: tokenAbi,
      functionName: 'faucet',
      args: [BigInt(250) * BigInt(10) ** BigInt(18)],
    })

    setHash(tx)
    setStatus('Hero currency faucet sent. Refreshing balance...')
    setTimeout(refetchBalance, 1500)
  }

  async function applyModule() {
    if (!selectedHeroId) return

    const tx = await writeContractAsync({
      address: HERO_NFT_ADDRESS,
      abi: heroNftAbi,
      functionName: 'applyModule',
      args: [selectedHeroId, Number(selectedModule)],
    })

    setHash(tx)
    setStatus('Module transaction sent. Refreshing hero stats...')
    setTimeout(() => {
      refetchNextHeroId()
      loadHeroes()
    }, 1500)
  }

  async function enterTournament() {
    if (!selectedHeroId) return

    const tx = await writeContractAsync({
      address: HERO_NFT_ADDRESS,
      abi: heroNftAbi,
      functionName: 'enterTournament',
      args: [selectedHeroId, stringToHex(tournamentSlug.slice(0, 32), { size: 32 })],
    })

    setHash(tx)
    setStatus(`Hero #${selectedHeroId.toString()} entered tournament ${tournamentSlug}.`)
  }

  const selectedHero = useMemo(
    () => heroes.find((hero) => hero.id === selectedHeroId) ?? null,
    [heroes, selectedHeroId],
  )

  const xpProgress = selectedHero ? Math.min(selectedHero.xp / xpForNextLevel(selectedHero.level), 1) : 0
  const upgradesLimit = selectedHero ? selectedHero.level + 2 : 0

  return (
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

              <div className="grid gap-3 rounded-[20px] border border-white/10 bg-black/20 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm text-slate-400">Hero currency</div>
                    <div className="text-lg font-bold text-white">Claim local test balance</div>
                  </div>
                  <button
                    type="button"
                    onClick={claimHeroCurrency}
                    disabled={!isConnected || !heroCurrencyReady || txPending}
                    className="rounded-2xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Claim 250
                  </button>
                </div>
                <div className="text-sm leading-6 text-slate-300">
                  Local helper for testing <code>buyPack()</code> without manual minting.
                </div>
              </div>

              <div className="grid gap-3 rounded-[20px] border border-white/10 bg-black/20 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm text-slate-400">Pack price</div>
                    <div className="text-2xl font-black text-white">
                      {packPrice !== undefined ? formatCurrency(packPrice) : '...'}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={buyPack}
                    disabled={!isConnected || !packContractsReady || txPending}
                    className="rounded-2xl bg-teal-400 px-5 py-3 text-sm font-black text-slate-950 transition hover:-translate-y-0.5 hover:bg-teal-300 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Buy Hero Pack
                  </button>
                </div>
                <div className="text-sm leading-6 text-slate-300">
                  After purchase the contract waits for Chainlink VRF callback, then mints the hero through <code>HeroNFT.mintHero</code>.
                </div>
              </div>

              <div className="grid gap-3 rounded-[20px] border border-white/10 bg-black/20 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm text-slate-400">Roster sync</div>
                    <div className="text-lg font-bold text-white">Load heroes from chain</div>
                  </div>
                  <button
                    type="button"
                    onClick={loadHeroes}
                    disabled={!isConnected || !heroContractsReady || isLoadingHeroes}
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
                const isSelected = selectedHeroId === hero.id
                return (
                  <button
                    key={hero.id.toString()}
                    type="button"
                    onClick={() => setSelectedHeroId(hero.id)}
                    className="rounded-[24px] border p-5 text-left transition hover:-translate-y-1"
                    style={{
                      borderColor: isSelected ? rarity.accent : 'rgba(255,255,255,0.08)',
                      background: `linear-gradient(180deg, ${rarity.glow} 0%, rgba(15,23,42,0.86) 100%)`,
                      boxShadow: isSelected ? `0 22px 55px ${rarity.glow}` : 'none',
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-300">{rarity.name}</div>
                        <div className="mt-2 text-2xl font-black text-white">Hero #{hero.id.toString()}</div>
                      </div>
                      <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-slate-200">
                        LVL {hero.level}
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-5 gap-2 text-center">
                      {statLabels.map((stat) => (
                        <div key={stat} className="rounded-2xl bg-black/20 px-2 py-3">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                            {stat.replace('_', '')}
                          </div>
                          <div className="mt-2 text-lg font-black text-white">{hero.total[stat]}</div>
                        </div>
                      ))}
                    </div>

                    <div className="mt-4 text-sm text-slate-300">
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

function Notice({ children, tone }: { children: React.ReactNode; tone: 'amber' | 'blue' }) {
  const classes =
    tone === 'amber'
      ? 'border-amber-300/20 bg-amber-300/10 text-amber-100'
      : 'border-sky-300/20 bg-sky-300/10 text-sky-100'

  return <div className={`rounded-[20px] border px-4 py-3 text-sm leading-6 ${classes}`}>{children}</div>
}
