'use client'

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { formatUnits, parseUnits, type PublicClient } from 'viem'
import { useAccount, usePublicClient, useReadContract, useWaitForTransactionReceipt, useWriteContract } from 'wagmi'
import { Navbar } from '@/components/navbar'
import { HamsterAvatar, RARITY_THEMES, type HeroSnapshot } from '@/components/HamsterAvatar'
import {
  HERO_CURRENCY_ADDRESS,
  HERO_MARKETPLACE_ADDRESS,
  HERO_NFT_ADDRESS,
  heroMarketplaceAbi,
  heroNftAbi,
  isConfiguredAddress,
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
  total: StatBlock
  level: number
  xp: number
  upgradesThisLevel: number
  approvedToMarket: boolean
}

type ListingData = {
  tokenId: bigint
  seller: `0x${string}`
  price: bigint
  hero: HeroCardData | null
}

const rarityMeta = [
  { name: 'Common', accent: '#94a3b8', glow: 'rgba(148,163,184,0.22)' },
  { name: 'Rare', accent: '#38bdf8', glow: 'rgba(56,189,248,0.22)' },
  { name: 'Epic', accent: '#f97316', glow: 'rgba(249,115,22,0.22)' },
  { name: 'Legendary', accent: '#facc15', glow: 'rgba(250,204,21,0.24)' },
] as const

function short(address?: string) {
  if (!address) return ''
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

function formatCurrency(value?: bigint) {
  if (value === undefined) return '0'
  return formatUnits(value, 18)
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

async function fetchHeroCard(
  publicClient: PublicClient,
  tokenId: bigint,
  marketplaceAddress: `0x${string}` | null,
): Promise<HeroCardData | null> {
  try {
    const heroData = await publicClient.readContract({
      address: HERO_NFT_ADDRESS,
      abi: heroNftAbi,
      functionName: 'hero',
      args: [tokenId],
    })

    const totalStats = await publicClient.readContract({
      address: HERO_NFT_ADDRESS,
      abi: heroNftAbi,
      functionName: 'totalStats',
      args: [tokenId],
    })

    const approved = marketplaceAddress
      ? ((await publicClient.readContract({
          address: HERO_NFT_ADDRESS,
          abi: heroNftAbi,
          functionName: 'getApproved',
          args: [tokenId],
        })) as `0x${string}`)
      : undefined

    return {
      id: tokenId,
      rarity: Number(heroData.rarity),
      total: normalizeStats(totalStats),
      level: Number(heroData.prog.level),
      xp: Number(heroData.prog.xp),
      upgradesThisLevel: Number(heroData.prog.upgradesThisLevel),
      approvedToMarket: !!marketplaceAddress && approved?.toLowerCase() === marketplaceAddress.toLowerCase(),
    }
  } catch {
    return null
  }
}

async function fetchOwnedHeroes(
  publicClient: PublicClient,
  owner: `0x${string}`,
  nextHeroId: bigint,
  marketplaceAddress: `0x${string}` | null,
): Promise<HeroCardData[]> {
  const maxId = Number(nextHeroId) - 1
  if (maxId <= 0) return []

  const heroes: HeroCardData[] = []

  for (let tokenIndex = 1; tokenIndex <= maxId; tokenIndex += 1) {
    const tokenId = BigInt(tokenIndex)

    try {
      const tokenOwner = (await publicClient.readContract({
        address: HERO_NFT_ADDRESS,
        abi: heroNftAbi,
        functionName: 'ownerOf',
        args: [tokenId],
      })) as `0x${string}`

      if (tokenOwner.toLowerCase() !== owner.toLowerCase()) continue

      const hero = await fetchHeroCard(publicClient, tokenId, marketplaceAddress)
      if (hero) heroes.push(hero)
    } catch {
      continue
    }
  }

  return heroes
}

export default function MarketplacePage() {
  const { address, isConnected, chain } = useAccount()
  const publicClient = usePublicClient()
  const { writeContractAsync } = useWriteContract()
  const [status, setStatus] = useState('Marketplace ready.')
  const [hash, setHash] = useState<`0x${string}` | undefined>()
  const [ownedHeroes, setOwnedHeroes] = useState<HeroCardData[]>([])
  const [listings, setListings] = useState<ListingData[]>([])
  const [loading, setLoading] = useState(false)
  const [priceInputs, setPriceInputs] = useState<Record<string, string>>({})

  const heroCurrencyReady = isConfiguredAddress(HERO_CURRENCY_ADDRESS)
  const heroContractsReady = isConfiguredAddress(HERO_NFT_ADDRESS)
  const marketplaceReady = isConfiguredAddress(HERO_MARKETPLACE_ADDRESS) && heroCurrencyReady && heroContractsReady
  const marketplaceAddress = marketplaceReady ? HERO_MARKETPLACE_ADDRESS : null

  const { data: balance, refetch: refetchBalance } = useReadContract({
    address: HERO_CURRENCY_ADDRESS,
    abi: tokenAbi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address && heroCurrencyReady },
  })

  const { data: nextHeroId } = useReadContract({
    address: HERO_NFT_ADDRESS,
    abi: heroNftAbi,
    functionName: 'nextId',
    query: { enabled: heroContractsReady },
  })

  const { data: feeBps } = useReadContract({
    address: HERO_MARKETPLACE_ADDRESS,
    abi: heroMarketplaceAbi,
    functionName: 'feeBps',
    query: { enabled: marketplaceReady },
  })

  const { data: txReceipt, isLoading: txPending } = useWaitForTransactionReceipt({
    hash,
    query: { enabled: !!hash },
  })

  const refreshMarketplace = useCallback(async () => {
    if (!publicClient || !marketplaceReady) {
      setListings([])
      setOwnedHeroes([])
      return
    }

    setLoading(true)

    try {
      const resolvedNextHeroId = nextHeroId ?? ((await publicClient.readContract({
        address: HERO_NFT_ADDRESS,
        abi: heroNftAbi,
        functionName: 'nextId',
      })) as bigint)

      const rawListings = (await publicClient.readContract({
        address: HERO_MARKETPLACE_ADDRESS,
        abi: heroMarketplaceAbi,
        functionName: 'getActiveListings',
      })) as Array<{
        tokenId: bigint
        seller: `0x${string}`
        price: bigint
      }>

      const hydratedListings = await Promise.all(
        rawListings.map(async (listing) => ({
          ...listing,
          hero: await fetchHeroCard(publicClient, listing.tokenId, marketplaceAddress),
        })),
      )

      setListings(hydratedListings)

      if (address) {
        const owned = await fetchOwnedHeroes(publicClient, address, resolvedNextHeroId, marketplaceAddress)
        setOwnedHeroes(owned)
      } else {
        setOwnedHeroes([])
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to load marketplace.')
    } finally {
      setLoading(false)
    }
  }, [address, marketplaceAddress, marketplaceReady, nextHeroId, publicClient])

  useEffect(() => {
    void refreshMarketplace()
  }, [refreshMarketplace])

  useEffect(() => {
    if (!txReceipt) return

    void refetchBalance()
    void refreshMarketplace()
  }, [refetchBalance, refreshMarketplace, txReceipt])

  const myListings = useMemo(
    () => listings.filter((listing) => listing.seller.toLowerCase() === address?.toLowerCase()),
    [address, listings],
  )

  const marketListings = useMemo(
    () => listings.filter((listing) => listing.seller.toLowerCase() !== address?.toLowerCase()),
    [address, listings],
  )

  function setPriceInput(tokenId: bigint, value: string) {
    setPriceInputs((current) => ({ ...current, [tokenId.toString()]: value }))
  }

  function getPriceInput(tokenId: bigint, fallback?: bigint) {
    const key = tokenId.toString()
    return priceInputs[key] ?? (fallback !== undefined ? formatCurrency(fallback) : '')
  }

  function parsePrice(tokenId: bigint, fallback?: bigint) {
    const raw = getPriceInput(tokenId, fallback).trim()
    if (!raw) return null

    try {
      const price = parseUnits(raw, 18)
      return price > 0n ? price : null
    } catch {
      return null
    }
  }

  async function approveHero(tokenId: bigint) {
    if (!marketplaceAddress) return

    const tx = await writeContractAsync({
      address: HERO_NFT_ADDRESS,
      abi: heroNftAbi,
      functionName: 'approve',
      args: [marketplaceAddress, tokenId],
    })

    setHash(tx)
    setStatus(`Approval sent for hero #${tokenId.toString()}.`)
  }

  async function listHero(tokenId: bigint) {
    const price = parsePrice(tokenId)
    if (!price) {
      setStatus('Enter a valid sale price greater than 0.')
      return
    }

    const tx = await writeContractAsync({
      address: HERO_MARKETPLACE_ADDRESS,
      abi: heroMarketplaceAbi,
      functionName: 'list',
      args: [tokenId, price],
    })

    setHash(tx)
    setStatus(`Listing hero #${tokenId.toString()} for ${formatCurrency(price)} currency.`)
  }

  async function updateListingPrice(tokenId: bigint, currentPrice: bigint) {
    const nextPrice = parsePrice(tokenId, currentPrice)
    if (!nextPrice) {
      setStatus('Enter a valid updated price greater than 0.')
      return
    }

    const tx = await writeContractAsync({
      address: HERO_MARKETPLACE_ADDRESS,
      abi: heroMarketplaceAbi,
      functionName: 'updatePrice',
      args: [tokenId, nextPrice],
    })

    setHash(tx)
    setStatus(`Updating price for hero #${tokenId.toString()}.`)
  }

  async function cancelListing(tokenId: bigint) {
    const tx = await writeContractAsync({
      address: HERO_MARKETPLACE_ADDRESS,
      abi: heroMarketplaceAbi,
      functionName: 'cancel',
      args: [tokenId],
    })

    setHash(tx)
    setStatus(`Canceling listing for hero #${tokenId.toString()}.`)
  }

  async function buyHero(tokenId: bigint, price: bigint) {
    const tx = await writeContractAsync({
      address: HERO_MARKETPLACE_ADDRESS,
      abi: heroMarketplaceAbi,
      functionName: 'buy',
      args: [tokenId],
    })

    setHash(tx)
    setStatus(`Buying hero #${tokenId.toString()} for ${formatCurrency(price)} currency.`)
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(96,165,250,0.16),transparent_26%),radial-gradient(circle_at_top_right,rgba(250,204,21,0.13),transparent_24%),linear-gradient(180deg,#07131a_0%,#0d1724_42%,#111827_100%)] px-4 py-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <Navbar />

        <section className="mt-6 overflow-hidden rounded-[28px] border border-white/10 bg-white/5 shadow-[0_30px_80px_rgba(0,0,0,0.28)] backdrop-blur">
          <div className="grid gap-8 px-6 py-8 lg:grid-cols-[1.1fr_0.9fr] lg:px-8">
            <div>
              <div className="inline-flex rounded-full border border-sky-300/20 bg-sky-300/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-sky-200">
                Hero Marketplace
              </div>
              <h1 className="mt-4 max-w-2xl text-4xl font-black tracking-tight text-white sm:text-5xl">
                Sell your beasts to other players for in-game currency.
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-slate-300">
                Approve a hero, set your own price, list it on-chain, and let other players buy it using the shared hero currency.
              </p>

              <div className="mt-8 grid gap-4 sm:grid-cols-4">
                <MetricCard label="Wallet" value={isConnected ? short(address) : 'Not connected'} hint={chain?.name ?? 'Connect MetaMask'} />
                <MetricCard label="Currency" value={isConnected ? formatCurrency(balance) : '0'} hint="Balance for marketplace buys" />
                <MetricCard label="For Sale" value={listings.length.toString()} hint="Active on-chain listings" />
                <MetricCard label="Fee" value={feeBps !== undefined ? `${Number(feeBps) / 100}%` : '...'} hint="Marketplace fee to treasury" />
              </div>
            </div>

            <div className="grid gap-4 rounded-[24px] border border-white/10 bg-slate-950/35 p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">Trading Desk</div>
                  <div className="mt-2 text-2xl font-black text-white">List, update, buy</div>
                </div>
                <div className={`rounded-full px-3 py-1 text-xs font-semibold ${txPending ? 'bg-amber-400/15 text-amber-200' : 'bg-emerald-400/15 text-emerald-200'}`}>
                  {txPending ? 'Transaction pending' : loading ? 'Syncing' : 'Ready'}
                </div>
              </div>

              {!isConnected && (
                <Notice tone="amber">
                  Connect your wallet to list heroes, set prices, and buy other players&apos; beasts.
                </Notice>
              )}

              {!heroContractsReady && (
                <Notice tone="amber">
                  Set <code>NEXT_PUBLIC_HERO_NFT_ADDRESS</code> to enable marketplace trading.
                </Notice>
              )}

              {!heroCurrencyReady && (
                <Notice tone="amber">
                  Set <code>NEXT_PUBLIC_HERO_CURRENCY_ADDRESS</code> to enable marketplace payments.
                </Notice>
              )}

              {!isConfiguredAddress(HERO_MARKETPLACE_ADDRESS) && (
                <Notice tone="amber">
                  Set <code>NEXT_PUBLIC_HERO_MARKETPLACE_ADDRESS</code> to enable hero listings.
                </Notice>
              )}

              <div className="grid gap-3 rounded-[20px] border border-white/10 bg-black/20 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm text-slate-400">Marketplace sync</div>
                    <div className="text-lg font-bold text-white">Refresh on-chain listings</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      void refreshMarketplace()
                    }}
                    disabled={!marketplaceReady || loading || txPending}
                    className="rounded-2xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Refresh
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

        <section className="mt-6 grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="rounded-[28px] border border-white/10 bg-slate-950/45 p-5 shadow-[0_24px_60px_rgba(0,0,0,0.25)]">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-400">Market</div>
                <h2 className="mt-2 text-2xl font-black text-white">Available heroes</h2>
              </div>
              <div className="rounded-full bg-white/5 px-3 py-1 text-sm font-semibold text-slate-300">
                {marketListings.length} listings
              </div>
            </div>

            <div className="mt-5 grid gap-4">
              {marketListings.length === 0 && (
                <EmptyState text="No heroes are listed yet. Be the first player to open the market." />
              )}

              {marketListings.map((listing) => (
                <ListingCard
                  key={listing.tokenId.toString()}
                  listing={listing}
                  actionLabel="Buy"
                  actionDisabled={!isConnected || txPending}
                  onAction={() => {
                    void buyHero(listing.tokenId, listing.price)
                  }}
                />
              ))}
            </div>
          </div>

          <div className="grid gap-6">
            <div className="rounded-[28px] border border-white/10 bg-slate-950/45 p-5 shadow-[0_24px_60px_rgba(0,0,0,0.25)]">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-400">My Listings</div>
                  <h2 className="mt-2 text-2xl font-black text-white">Heroes already for sale</h2>
                </div>
                <div className="rounded-full bg-white/5 px-3 py-1 text-sm font-semibold text-slate-300">
                  {myListings.length} active
                </div>
              </div>

              <div className="mt-5 grid gap-4">
                {myListings.length === 0 && (
                  <EmptyState text="You do not have active listings yet." />
                )}

                {myListings.map((listing) => (
                  <div key={listing.tokenId.toString()} className="rounded-[24px] border border-white/10 bg-white/[0.03] p-4">
                    <ListingCard
                      listing={listing}
                      actionLabel="Cancel"
                      actionDisabled={txPending}
                      onAction={() => {
                        void cancelListing(listing.tokenId)
                      }}
                    />
                    <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                      <input
                        value={getPriceInput(listing.tokenId, listing.price)}
                        onChange={(event) => setPriceInput(listing.tokenId, event.target.value)}
                        placeholder="New price"
                        className="h-12 flex-1 rounded-2xl border border-white/10 bg-slate-950/55 px-4 text-sm text-white outline-none transition focus:border-sky-300/40"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          void updateListingPrice(listing.tokenId, listing.price)
                        }}
                        disabled={txPending}
                        className="rounded-2xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Update Price
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[28px] border border-white/10 bg-slate-950/45 p-5 shadow-[0_24px_60px_rgba(0,0,0,0.25)]">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-400">Sell Heroes</div>
                  <h2 className="mt-2 text-2xl font-black text-white">Your wallet inventory</h2>
                </div>
                <div className="rounded-full bg-white/5 px-3 py-1 text-sm font-semibold text-slate-300">
                  {ownedHeroes.length} owned
                </div>
              </div>

              <div className="mt-5 grid gap-4">
                {ownedHeroes.length === 0 && (
                  <EmptyState text="No owned heroes available for listing right now." />
                )}

                {ownedHeroes.map((hero) => {
                  const snapshot: HeroSnapshot = {
                    id: hero.id,
                    rarity: hero.rarity,
                    total: hero.total,
                  }

                  return (
                    <div key={hero.id.toString()} className="rounded-[24px] border border-white/10 bg-white/[0.03] p-4">
                      <div className="flex gap-4">
                        <div className="overflow-hidden rounded-[18px]">
                          <HamsterAvatar hero={snapshot} size={92} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                                {rarityMeta[hero.rarity]?.name ?? 'Common'}
                              </div>
                              <div className="mt-1 text-xl font-black text-white">Hero #{hero.id.toString()}</div>
                            </div>
                            <div className="rounded-full bg-white/5 px-3 py-1 text-xs font-semibold text-slate-200">
                              LVL {hero.level}
                            </div>
                          </div>
                          <div className="mt-3 grid grid-cols-5 gap-2 text-center">
                            {(['atk', 'def_', 'hp', 'agi', 'lck'] as const).map((stat) => (
                              <div key={stat} className="rounded-xl bg-black/20 px-1 py-2">
                                <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-400">
                                  {stat.replace('_', '')}
                                </div>
                                <div className="mt-1 text-sm font-black text-white">{hero.total[stat]}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                        <input
                          value={getPriceInput(hero.id)}
                          onChange={(event) => setPriceInput(hero.id, event.target.value)}
                          placeholder="Price in hero currency"
                          className="h-12 flex-1 rounded-2xl border border-white/10 bg-slate-950/55 px-4 text-sm text-white outline-none transition focus:border-sky-300/40"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            void (hero.approvedToMarket ? listHero(hero.id) : approveHero(hero.id))
                          }}
                          disabled={!marketplaceReady || txPending}
                          className="rounded-2xl bg-sky-400 px-5 py-3 text-sm font-black text-slate-950 transition hover:-translate-y-0.5 hover:bg-sky-300 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {hero.approvedToMarket ? 'List for Sale' : 'Approve'}
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}

function MetricCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-[24px] border border-white/10 bg-slate-950/35 p-4">
      <div className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-400">{label}</div>
      <div className="mt-3 text-2xl font-black text-white">{value}</div>
      <div className="mt-2 text-sm text-slate-300">{hint}</div>
    </div>
  )
}

function Notice({ tone, children }: { tone: 'amber' | 'sky'; children: ReactNode }) {
  const toneClasses = tone === 'amber'
    ? 'border-amber-300/20 bg-amber-300/10 text-amber-100'
    : 'border-sky-300/20 bg-sky-300/10 text-sky-100'

  return <div className={`rounded-2xl border px-4 py-3 text-sm leading-6 ${toneClasses}`}>{children}</div>
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-[24px] border border-dashed border-white/15 bg-white/[0.03] p-6 text-sm leading-7 text-slate-400">
      {text}
    </div>
  )
}

function ListingCard({
  listing,
  actionLabel,
  actionDisabled,
  onAction,
}: {
  listing: ListingData
  actionLabel: string
  actionDisabled: boolean
  onAction: () => void
}) {
  const hero = listing.hero
  const rarityIndex = hero ? Math.min(hero.rarity, RARITY_THEMES.length - 1) : 0
  const theme = RARITY_THEMES[rarityIndex] ?? RARITY_THEMES[0]!
  const snapshot: HeroSnapshot | null = hero
    ? {
        id: hero.id,
        rarity: hero.rarity,
        total: hero.total,
      }
    : null

  return (
    <div
      className="rounded-[24px] border p-4"
      style={{
        borderColor: theme.ring,
        background: `linear-gradient(160deg, ${theme.bg} 0%, rgba(8,12,24,0.96) 100%)`,
        boxShadow: `0 0 0 1px ${theme.ring}22, 0 0 20px ${theme.glow}`,
      }}
    >
      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="overflow-hidden rounded-[18px]">
          {snapshot ? <HamsterAvatar hero={snapshot} size={96} /> : <div className="h-24 w-24 rounded-[18px] bg-white/5" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">
                {hero ? (rarityMeta[hero.rarity]?.name ?? 'Common') : 'Unknown'}
              </div>
              <div className="mt-1 text-xl font-black text-white">Hero #{listing.tokenId.toString()}</div>
              <div className="mt-1 text-sm text-slate-300">Seller: {short(listing.seller)}</div>
            </div>
            <div className="rounded-full bg-white/10 px-3 py-1 text-sm font-semibold text-white">
              {formatCurrency(listing.price)}
            </div>
          </div>

          {hero && (
            <div className="mt-3 grid grid-cols-5 gap-2 text-center">
              {(['atk', 'def_', 'hp', 'agi', 'lck'] as const).map((stat) => (
                <div key={stat} className="rounded-xl bg-black/20 px-1 py-2">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-400">
                    {stat.replace('_', '')}
                  </div>
                  <div className="mt-1 text-sm font-black text-white">{hero.total[stat]}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={onAction}
          disabled={actionDisabled}
          className="rounded-2xl bg-white/10 px-5 py-3 text-sm font-black text-white transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {actionLabel}
        </button>
      </div>
    </div>
  )
}
