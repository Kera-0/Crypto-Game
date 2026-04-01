'use client'

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { formatEther, parseEther, type PublicClient } from 'viem'
import {
  useAccount,
  usePublicClient,
  useWaitForTransactionReceipt,
  useWriteContract,
} from 'wagmi'
import { Navbar } from '@/components/navbar'
import {
  BUILDING_ITEM_ADDRESS,
  BUILDING_MARKETPLACE_ADDRESS,
  CITY_ADDRESS,
  buildingItemAbi,
  buildingMarketplaceAbi,
  isConfiguredAddress,
} from '@/lib/contracts'

// ─── Building type metadata ────────────────────────────────────────────────

type BuildingTypeMeta = {
  id: number
  name: string
  icon: string
  description: string
  accent: string
  glow: string
  bg: string
  ring: string
}

const BUILDING_TYPES: BuildingTypeMeta[] = [
  {
    id: 0,
    name: 'Mine',
    icon: '⛏️',
    description: 'Generates money over time. Place in your city to earn gold.',
    accent: '#f59e0b',
    glow: 'rgba(245,158,11,0.22)',
    bg: 'rgba(245,158,11,0.06)',
    ring: '#f59e0b55',
  },
  {
    id: 1,
    name: 'Barracks',
    icon: '🏰',
    description: 'Produces power for your city. Essential for army upgrades.',
    accent: '#3b82f6',
    glow: 'rgba(59,130,246,0.22)',
    bg: 'rgba(59,130,246,0.06)',
    ring: '#3b82f655',
  },
  {
    id: 2,
    name: 'Tower',
    icon: '🗼',
    description: 'Decorative structure that boosts city aesthetics and defence.',
    accent: '#8b5cf6',
    glow: 'rgba(139,92,246,0.22)',
    bg: 'rgba(139,92,246,0.06)',
    ring: '#8b5cf655',
  },
]

const FALLBACK_META: BuildingTypeMeta = BUILDING_TYPES[0]!

function getBuildingType(dna: bigint): number {
  return Number(dna & BigInt(0x1f))
}

function getBuildingTypeMeta(typeId: number): BuildingTypeMeta {
  return BUILDING_TYPES[typeId] ?? FALLBACK_META
}

// ─── Types ─────────────────────────────────────────────────────────────────

type OwnedBuilding = {
  tokenId: bigint
  typeId: number
  level: number
  isActive: boolean
  updateReadyTime: bigint
}

type PlayerListing = {
  tokenId: bigint
  seller: `0x${string}`
  price: bigint
  typeId: number
}

type StockEntry = {
  typeId: number
  remaining: bigint
  price: bigint
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function short(address?: string) {
  if (!address) return ''
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

async function fetchOwnedBuildings(
  publicClient: PublicClient,
  owner: `0x${string}`,
): Promise<OwnedBuilding[]> {
  type BuildingTuple = { dna: bigint; level: number; updateReadyTime: bigint; isActive: boolean }

  let buildings: BuildingTuple[]
  try {
    buildings = (await publicClient.readContract({
      address: BUILDING_ITEM_ADDRESS,
      abi: buildingItemAbi,
      functionName: 'getBuildingsByOwner',
      args: [owner, false],
    })) as BuildingTuple[]
  } catch {
    return []
  }

  if (!buildings.length) return []

  const tokenIds = await Promise.all(
    buildings.map((_, i) =>
      publicClient.readContract({
        address: BUILDING_ITEM_ADDRESS,
        abi: buildingItemAbi,
        functionName: 'ownerToBuildingIds',
        args: [owner, BigInt(i)],
      }) as Promise<bigint>,
    ),
  )

  return buildings.map((b, i) => ({
    tokenId: tokenIds[i]!,
    typeId: getBuildingType(b.dna),
    level: Number(b.level),
    isActive: b.isActive,
    updateReadyTime: b.updateReadyTime,
  }))
}

// ─── Page ──────────────────────────────────────────────────────────────────

export default function BuildingsMarketplacePage() {
  const { address, isConnected } = useAccount()
  const publicClient = usePublicClient()
  const { writeContractAsync } = useWriteContract()

  const [status, setStatus] = useState('Marketplace ready.')
  const [hash, setHash] = useState<`0x${string}` | undefined>()
  const [loading, setLoading] = useState(false)
  const [stock, setStock] = useState<StockEntry[]>([])
  const [playerListings, setPlayerListings] = useState<PlayerListing[]>([])
  const [ownedBuildings, setOwnedBuildings] = useState<OwnedBuilding[]>([])
  const [listPrices, setListPrices] = useState<Record<string, string>>({})
  const [updatePrices, setUpdatePrices] = useState<Record<string, string>>({})
  const [activeTab, setActiveTab] = useState<'stock' | 'listings' | 'sell'>('stock')

  const marketplaceReady = isConfiguredAddress(BUILDING_MARKETPLACE_ADDRESS)
  const buildingItemReady = isConfiguredAddress(BUILDING_ITEM_ADDRESS)

  const { data: txReceipt } = useWaitForTransactionReceipt({
    hash,
    query: { enabled: !!hash },
  })

  const refresh = useCallback(async () => {
    if (!publicClient || !marketplaceReady) return
    setLoading(true)
    try {
      const [remaining, prices] = (await publicClient.readContract({
        address: BUILDING_MARKETPLACE_ADDRESS,
        abi: buildingMarketplaceAbi,
        functionName: 'getStockInfo',
      })) as [bigint[], bigint[]]

      setStock(
        remaining.map((rem, i) => ({
          typeId: i,
          remaining: rem,
          price: prices[i]!,
        })),
      )

      const [tokenIds, sellers, listingPrices] = (await publicClient.readContract({
        address: BUILDING_MARKETPLACE_ADDRESS,
        abi: buildingMarketplaceAbi,
        functionName: 'getActiveListings',
      })) as [bigint[], `0x${string}`[], bigint[]]

      const hydratedListings: PlayerListing[] = await Promise.all(
        tokenIds.map(async (tid, i) => {
          let typeId = 0
          try {
            const b = (await publicClient.readContract({
              address: BUILDING_ITEM_ADDRESS,
              abi: buildingItemAbi,
              functionName: 'buildings',
              args: [tid],
            })) as { dna: bigint }
            typeId = getBuildingType(b.dna)
          } catch {}
          return {
            tokenId: tid,
            seller: sellers[i]!,
            price: listingPrices[i]!,
            typeId,
          }
        }),
      )

      setPlayerListings(hydratedListings)

      if (address && buildingItemReady) {
        const owned = await fetchOwnedBuildings(publicClient, address)
        setOwnedBuildings(owned.filter((b) => !b.isActive))
      }
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Failed to load marketplace.')
    } finally {
      setLoading(false)
    }
  }, [address, buildingItemReady, marketplaceReady, publicClient])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (!txReceipt) return
    if (txReceipt.status === 'reverted') {
      setStatus('Transaction reverted — run make hh && make deploy-local to reset contracts.')
      return
    }
    void refresh()
  }, [refresh, txReceipt])

  const myListings = useMemo(
    () => playerListings.filter((l) => l.seller.toLowerCase() === address?.toLowerCase()),
    [address, playerListings],
  )
  const otherListings = useMemo(
    () => playerListings.filter((l) => l.seller.toLowerCase() !== address?.toLowerCase()),
    [address, playerListings],
  )

  function extractError(err: unknown): string {
    if (typeof err === 'object' && err !== null) {
      if ('shortMessage' in err && typeof err.shortMessage === 'string') return err.shortMessage
      if ('message' in err && typeof err.message === 'string') return err.message.split('\n')[0] ?? 'Unknown error'
    }
    return 'Unknown error'
  }

  async function buyFromStock(typeId: number, price: bigint) {
    try {
      const tx = await writeContractAsync({
        address: BUILDING_MARKETPLACE_ADDRESS,
        abi: buildingMarketplaceAbi,
        functionName: 'buyFromStock',
        args: [typeId],
        value: price,
      })
      setHash(tx)
      setStatus(`Buying ${getBuildingTypeMeta(typeId).name} from stock…`)
    } catch (err) {
      setStatus(`Buy failed: ${extractError(err)}`)
    }
  }

  async function buyListing(tokenId: bigint, price: bigint) {
    try {
      const tx = await writeContractAsync({
        address: BUILDING_MARKETPLACE_ADDRESS,
        abi: buildingMarketplaceAbi,
        functionName: 'buy',
        args: [tokenId],
        value: price,
      })
      setHash(tx)
      setStatus(`Buying building #${tokenId}…`)
    } catch (err) {
      setStatus(`Buy failed: ${extractError(err)}`)
    }
  }

  async function listBuilding(tokenId: bigint) {
    const raw = (listPrices[tokenId.toString()] ?? '').trim()
    if (!raw) { setStatus('Enter a price first.'); return }
    let price: bigint
    try { price = parseEther(raw) } catch { setStatus('Invalid price.'); return }
    if (price === 0n) { setStatus('Price must be > 0.'); return }

    try {
      const tx = await writeContractAsync({
        address: BUILDING_MARKETPLACE_ADDRESS,
        abi: buildingMarketplaceAbi,
        functionName: 'list',
        args: [tokenId, price],
      })
      setHash(tx)
      setStatus(`Listing building #${tokenId} for ${raw} ETH…`)
    } catch (err) {
      setStatus(`List failed: ${extractError(err)}`)
    }
  }

  async function cancelListing(tokenId: bigint) {
    try {
      const tx = await writeContractAsync({
        address: BUILDING_MARKETPLACE_ADDRESS,
        abi: buildingMarketplaceAbi,
        functionName: 'cancel',
        args: [tokenId],
      })
      setHash(tx)
      setStatus(`Canceling listing for building #${tokenId}…`)
    } catch (err) {
      setStatus(`Cancel failed: ${extractError(err)}`)
    }
  }

  async function updateListingPrice(tokenId: bigint) {
    const raw = (updatePrices[tokenId.toString()] ?? '').trim()
    if (!raw) { setStatus('Enter a new price.'); return }
    let price: bigint
    try { price = parseEther(raw) } catch { setStatus('Invalid price.'); return }
    if (price === 0n) { setStatus('Price must be > 0.'); return }

    try {
      const tx = await writeContractAsync({
        address: BUILDING_MARKETPLACE_ADDRESS,
        abi: buildingMarketplaceAbi,
        functionName: 'updatePrice',
        args: [tokenId, price],
      })
      setHash(tx)
      setStatus(`Updating price for building #${tokenId}…`)
    } catch (err) {
      setStatus(`Update failed: ${extractError(err)}`)
    }
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.12),transparent_26%),radial-gradient(circle_at_top_right,rgba(139,92,246,0.12),transparent_24%),linear-gradient(180deg,#07131a_0%,#0d1724_42%,#111827_100%)] px-4 py-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <Navbar />

        {/* ─── Hero banner ─── */}
        <section className="mt-6 overflow-hidden rounded-[28px] border border-white/10 bg-white/5 shadow-[0_30px_80px_rgba(0,0,0,0.28)] backdrop-blur">
          <div className="grid gap-8 px-6 py-8 lg:grid-cols-[1.1fr_0.9fr] lg:px-8">
            <div>
              <div className="inline-flex rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-amber-200">
                Buildings Marketplace
              </div>
              <h1 className="mt-4 max-w-2xl text-4xl font-black tracking-tight text-white sm:text-5xl">
                Buy, sell and trade city buildings.
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-slate-300">
                The game restocks{' '}
                <span className="font-bold text-amber-300">100 buildings per type every day</span>.
                Players can also list their own buildings at any price they choose.
              </p>

              <div className="mt-8 grid gap-4 sm:grid-cols-3">
                <MetricCard
                  label="Wallet"
                  value={isConnected ? short(address) : 'Not connected'}
                  hint="Your address"
                  accent="#f59e0b"
                />
                <MetricCard
                  label="Player listings"
                  value={otherListings.length.toString()}
                  hint="Active player resales"
                  accent="#3b82f6"
                />
                <MetricCard
                  label="My listings"
                  value={myListings.length.toString()}
                  hint="Buildings you listed"
                  accent="#8b5cf6"
                />
              </div>
            </div>

            {/* ─── Status panel ─── */}
            <div className="grid gap-4 rounded-[24px] border border-white/10 bg-slate-950/35 p-5 content-start">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">
                    Status
                  </div>
                  <div className="mt-2 text-2xl font-black text-white">Trading desk</div>
                </div>
                <div
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    loading
                      ? 'bg-amber-400/15 text-amber-200'
                      : 'bg-emerald-400/15 text-emerald-200'
                  }`}
                >
                  {loading ? 'Loading…' : 'Ready'}
                </div>
              </div>

              {!isConnected && (
                <Notice tone="amber">Connect your wallet to buy and list buildings.</Notice>
              )}
              {!marketplaceReady && (
                <Notice tone="amber">
                  Set <code>NEXT_PUBLIC_BUILDING_MARKETPLACE_ADDRESS</code> to enable the marketplace.
                </Notice>
              )}

              <div className="rounded-[20px] border border-white/10 bg-black/20 p-4 grid gap-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm text-slate-400">Sync listings</div>
                    <div className="text-base font-bold text-white">{status}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void refresh()}
                    disabled={!marketplaceReady || loading}
                    className="rounded-2xl border border-white/15 bg-white/5 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Refresh
                  </button>
                </div>
                {hash && (
                  <div className="break-all rounded-2xl border border-white/10 bg-slate-950/45 px-3 py-2 text-xs text-slate-400">
                    tx: {hash}
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* ─── Tab switcher ─── */}
        <div className="mt-6 flex gap-2">
          {(
            [
              { key: 'stock', label: 'Daily Stock', count: stock.length },
              { key: 'listings', label: 'Player Listings', count: otherListings.length },
              { key: 'sell', label: 'Sell Buildings', count: ownedBuildings.length },
            ] as const
          ).map(({ key, label, count }) => (
            <button
              key={key}
              type="button"
              onClick={() => setActiveTab(key)}
              className={`rounded-2xl px-5 py-2.5 text-sm font-semibold transition ${
                activeTab === key
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white'
              }`}
            >
              {label}
              <span
                className={`ml-2 rounded-full px-2 py-0.5 text-xs font-bold ${
                  activeTab === key ? 'bg-slate-200 text-slate-800' : 'bg-white/10 text-slate-300'
                }`}
              >
                {count}
              </span>
            </button>
          ))}
        </div>

        {/* ─── Daily Stock ─── */}
        {activeTab === 'stock' && (
          <section className="mt-4 grid gap-5 sm:grid-cols-3">
            {stock.map((entry) => {
              const meta = getBuildingTypeMeta(entry.typeId)
              const soldOut = entry.remaining === 0n
              const noPrice = entry.price === 0n
              return (
                <div
                  key={entry.typeId}
                  className="rounded-[28px] border p-6"
                  style={{
                    borderColor: meta.ring,
                    background: `linear-gradient(160deg,${meta.bg} 0%,rgba(8,12,24,0.97) 100%)`,
                    boxShadow: `0 0 0 1px ${meta.ring}, 0 0 28px ${meta.glow}`,
                  }}
                >
                  <div className="text-5xl">{meta.icon}</div>
                  <div className="mt-4 text-2xl font-black text-white">{meta.name}</div>
                  <p className="mt-2 text-sm leading-6 text-slate-400">{meta.description}</p>

                  <div className="mt-5 grid grid-cols-2 gap-3">
                    <div className="rounded-2xl bg-black/30 px-3 py-3 text-center">
                      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                        Remaining
                      </div>
                      <div
                        className="mt-1 text-2xl font-black"
                        style={{ color: soldOut ? '#ef4444' : meta.accent }}
                      >
                        {soldOut ? '0' : entry.remaining.toString()}
                      </div>
                      <div className="text-[10px] text-slate-500">of 100 / day</div>
                    </div>
                    <div className="rounded-2xl bg-black/30 px-3 py-3 text-center">
                      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                        Price
                      </div>
                      <div className="mt-1 text-2xl font-black text-white">
                        {noPrice ? '—' : `${formatEther(entry.price)} ETH`}
                      </div>
                    </div>
                  </div>

                  {/* Daily progress bar */}
                  <div className="mt-4">
                    <div className="flex justify-between text-xs text-slate-500 mb-1">
                      <span>Daily progress</span>
                      <span>{100 - Number(entry.remaining)}/100</span>
                    </div>
                    <div className="h-2 rounded-full bg-white/10">
                      <div
                        className="h-2 rounded-full transition-all"
                        style={{
                          width: `${100 - Number(entry.remaining)}%`,
                          background: soldOut ? '#ef4444' : meta.accent,
                        }}
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => void buyFromStock(entry.typeId, entry.price)}
                    disabled={!isConnected || !marketplaceReady || soldOut || noPrice}
                    className="mt-5 w-full rounded-2xl py-3 text-sm font-black transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
                    style={{
                      background: soldOut || noPrice ? 'rgba(255,255,255,0.06)' : meta.accent,
                      color: soldOut || noPrice ? '#94a3b8' : '#0f172a',
                    }}
                  >
                    {noPrice ? 'Not available' : soldOut ? 'Sold out — resets tomorrow' : 'Buy Now'}
                  </button>
                </div>
              )
            })}

            {stock.length === 0 && !loading && (
              <div className="col-span-3">
                <EmptyState text="Could not load daily stock. Make sure the marketplace contract is configured." />
              </div>
            )}
          </section>
        )}

        {/* ─── Player Listings ─── */}
        {activeTab === 'listings' && (
          <section className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {otherListings.length === 0 && (
              <div className="col-span-3">
                <EmptyState text="No player listings yet. Be the first to list a building for sale." />
              </div>
            )}
            {otherListings.map((listing) => {
              const meta = getBuildingTypeMeta(listing.typeId)
              return (
                <PlayerListingCard
                  key={listing.tokenId.toString()}
                  listing={listing}
                  meta={meta}
                  onBuy={() => void buyListing(listing.tokenId, listing.price)}
                  buyDisabled={!isConnected || !marketplaceReady}
                />
              )
            })}
          </section>
        )}

        {/* ─── Sell Buildings ─── */}
        {activeTab === 'sell' && (
          <section className="mt-4 grid gap-5 lg:grid-cols-[1fr_1fr]">
            {/* My active listings */}
            <div className="rounded-[28px] border border-white/10 bg-slate-950/45 p-5">
              <SectionHeader
                label="My Listings"
                title="Buildings already for sale"
                count={myListings.length}
                suffix="active"
              />
              <div className="mt-4 grid gap-4">
                {myListings.length === 0 && (
                  <EmptyState text="You have no active listings." />
                )}
                {myListings.map((listing) => {
                  const meta = getBuildingTypeMeta(listing.typeId)
                  const key = listing.tokenId.toString()
                  return (
                    <div
                      key={key}
                      className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-3xl">{meta.icon}</span>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs text-slate-400 uppercase tracking-wide">
                            {meta.name}
                          </div>
                          <div className="font-black text-white">
                            Building #{key} &mdash;{' '}
                            <span className="font-semibold text-amber-300">
                              {formatEther(listing.price)} ETH
                            </span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => void cancelListing(listing.tokenId)}
                          className="rounded-xl border border-red-400/30 bg-red-400/10 px-3 py-1.5 text-xs font-semibold text-red-300 hover:bg-red-400/20 transition"
                        >
                          Cancel
                        </button>
                      </div>
                      <div className="mt-3 flex gap-2">
                        <input
                          value={updatePrices[key] ?? ''}
                          onChange={(e) =>
                            setUpdatePrices((prev) => ({ ...prev, [key]: e.target.value }))
                          }
                          placeholder="New price in ETH"
                          className="h-10 flex-1 rounded-2xl border border-white/10 bg-slate-950/55 px-4 text-sm text-white outline-none focus:border-amber-300/40"
                        />
                        <button
                          type="button"
                          onClick={() => void updateListingPrice(listing.tokenId)}
                          className="rounded-2xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10 transition"
                        >
                          Update
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Inventory to sell */}
            <div className="rounded-[28px] border border-white/10 bg-slate-950/45 p-5">
              <SectionHeader
                label="Inventory"
                title="Buildings in your wallet"
                count={ownedBuildings.length}
                suffix="owned"
              />
              <div className="mt-4 grid gap-4">
                {!isConnected && (
                  <EmptyState text="Connect your wallet to see your buildings." />
                )}
                {isConnected && ownedBuildings.length === 0 && (
                  <EmptyState text="No buildings in your inventory. Buy some from the daily stock!" />
                )}
                {ownedBuildings.map((b) => {
                  const meta = getBuildingTypeMeta(b.typeId)
                  const key = b.tokenId.toString()
                  return (
                    <div
                      key={key}
                      className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4"
                    >
                      <div className="flex items-center gap-3 mb-3">
                        <span className="text-3xl">{meta.icon}</span>
                        <div className="flex-1">
                          <div className="text-xs text-slate-400 uppercase tracking-wide">
                            {meta.name}
                          </div>
                          <div className="font-black text-white">
                            Building #{key}
                          </div>
                          <div className="text-xs text-slate-500">Level {b.level}</div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <input
                          value={listPrices[key] ?? ''}
                          onChange={(e) =>
                            setListPrices((prev) => ({ ...prev, [key]: e.target.value }))
                          }
                          placeholder="Price in ETH"
                          className="h-10 flex-1 rounded-2xl border border-white/10 bg-slate-950/55 px-4 text-sm text-white outline-none focus:border-amber-300/40"
                        />
                        <button
                          type="button"
                          onClick={() => void listBuilding(b.tokenId)}
                          disabled={!marketplaceReady}
                          className="rounded-2xl px-4 py-2 text-sm font-black text-slate-900 transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
                          style={{ background: meta.accent }}
                        >
                          List for Sale
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </section>
        )}
      </div>
    </main>
  )
}

// ─── Sub-components ────────────────────────────────────────────────────────

function MetricCard({
  label,
  value,
  hint,
  accent,
}: {
  label: string
  value: string
  hint: string
  accent: string
}) {
  return (
    <div className="rounded-[24px] border border-white/10 bg-slate-950/35 p-4">
      <div className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-400">{label}</div>
      <div className="mt-3 text-2xl font-black" style={{ color: accent }}>
        {value}
      </div>
      <div className="mt-2 text-sm text-slate-400">{hint}</div>
    </div>
  )
}

function SectionHeader({
  label,
  title,
  count,
  suffix,
}: {
  label: string
  title: string
  count: number
  suffix: string
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
          {label}
        </div>
        <h2 className="mt-1 text-xl font-black text-white">{title}</h2>
      </div>
      <div className="rounded-full bg-white/5 px-3 py-1 text-sm font-semibold text-slate-300">
        {count} {suffix}
      </div>
    </div>
  )
}

function Notice({ tone, children }: { tone: 'amber' | 'sky'; children: ReactNode }) {
  const cls =
    tone === 'amber'
      ? 'border-amber-300/20 bg-amber-300/10 text-amber-100'
      : 'border-sky-300/20 bg-sky-300/10 text-sky-100'
  return (
    <div className={`rounded-2xl border px-4 py-3 text-sm leading-6 ${cls}`}>{children}</div>
  )
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-[24px] border border-dashed border-white/15 bg-white/[0.03] p-6 text-sm leading-7 text-slate-400">
      {text}
    </div>
  )
}

function PlayerListingCard({
  listing,
  meta,
  onBuy,
  buyDisabled,
}: {
  listing: PlayerListing
  meta: BuildingTypeMeta
  onBuy: () => void
  buyDisabled: boolean
}) {
  return (
    <div
      className="rounded-[24px] border p-5 flex flex-col gap-4"
      style={{
        borderColor: meta.ring,
        background: `linear-gradient(160deg,${meta.bg} 0%,rgba(8,12,24,0.97) 100%)`,
        boxShadow: `0 0 0 1px ${meta.ring}, 0 0 20px ${meta.glow}`,
      }}
    >
      <div className="flex items-start gap-4">
        <span className="text-4xl">{meta.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
            {meta.name}
          </div>
          <div className="mt-0.5 text-xl font-black text-white">
            Building #{listing.tokenId.toString()}
          </div>
          <div className="mt-1 text-sm text-slate-400">Seller: {short(listing.seller)}</div>
        </div>
        <div
          className="rounded-full px-3 py-1 text-sm font-black"
          style={{ background: meta.ring, color: meta.accent }}
        >
          {formatEther(listing.price)} ETH
        </div>
      </div>

      <button
        type="button"
        onClick={onBuy}
        disabled={buyDisabled}
        className="w-full rounded-2xl py-3 text-sm font-black transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
        style={{ background: meta.accent, color: '#0f172a' }}
      >
        Buy
      </button>
    </div>
  )
}
