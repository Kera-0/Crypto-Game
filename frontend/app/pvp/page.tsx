'use client'

import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { decodeEventLog, formatEther } from 'viem'
import type { PublicClient } from 'viem'
import { useAccount, usePublicClient, useReadContract, useWaitForTransactionReceipt, useWriteContract } from 'wagmi'
import { Navbar } from '@/components/navbar'
import {
  CITY_ADDRESS,
  HERO_NFT_ADDRESS,
  PVP_BATTLES_ADDRESS,
  cityAbi,
  heroNftAbi,
  isConfiguredAddress,
  pvpBattlesAbi,
} from '@/lib/contracts'

type ArmySum = {
  atk: bigint
  def_: bigint
  hp: bigint
  agi: bigint
  lck: bigint
}

type CityStats = { level: number; power: bigint; defense: bigint }

type CityCoord = { x: number; y: number }

type TargetCard = {
  player: `0x${string}`
  distance?: number
  coord?: CityCoord
  city?: CityStats
  army?: ArmySum
}

type MyBattleProfile = {
  city: CityStats | null
  army: ArmySum
  coord: CityCoord | null
}

type ActiveMarch = {
  from: CityCoord
  to: CityCoord
  startMs: number
  durationSec: number
  defender: `0x${string}`
  marchKey: string
}

type StoredMarch = {
  attacker: `0x${string}`
  defender: `0x${string}`
  startMs: number
  durationSec: number
}

function marchStorageKey(addr: `0x${string}` | undefined) {
  if (!addr) return 'crypto-game:pvpMarch:unknown'
  return `crypto-game:pvpMarch:${addrLower(addr)}`
}

const TOURNAMENT_LEADERBOARD_REFRESH_MS = 15_000

const MAP_ZOOM_MIN = 0.35
const MAP_ZOOM_MAX = 4
const MAP_ZOOM_STEP = 1.12

type TournamentRow = { player: `0x${string}`; wins: number }

function short(addr?: string) {
  if (!addr) return ''
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

function dist(ax: number, ay: number, bx: number, by: number) {
  return Math.abs(ax - bx) + Math.abs(ay - by)
}

function addrLower(addr?: string) {
  return (addr ?? '').toLowerCase()
}

function addrEq(a?: string, b?: string) {
  return addrLower(a) === addrLower(b)
}

function toNumOrNull(v: unknown) {
  if (v === undefined || v === null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function storageSet(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value)
  } catch {
  }
}

function storageRemove(key: string) {
  try {
    window.localStorage.removeItem(key)
  } catch {
  }
}

function formatDateTime(tsMs: number) {
  const d = new Date(tsMs)
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = String(d.getFullYear())
  const hh = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  const ss = String(d.getSeconds()).padStart(2, '0')
  return `${dd}.${mm}.${yyyy} ${hh}:${min}:${ss}`
}

function formatDuration(totalSeconds: number) {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return '0s'
  const full = Math.floor(totalSeconds)
  const days = Math.floor(full / 86_400)
  const hours = Math.floor((full % 86_400) / 3_600)
  const minutes = Math.floor((full % 3_600) / 60)
  const seconds = full % 60
  const parts: string[] = []
  if (days > 0) parts.push(`${days}d`)
  if (days > 0 || hours > 0) parts.push(`${hours}h`)
  if (days > 0 || hours > 0 || minutes > 0) parts.push(`${minutes}m`)
  parts.push(`${seconds}s`)
  return parts.join(' ')
}

async function readCityCoord(
  publicClient: PublicClient,
  player: `0x${string}`,
): Promise<CityCoord | null> {
  try {
    const [x, y] = (await publicClient.readContract({
      address: CITY_ADDRESS,
      abi: cityAbi,
      functionName: 'getCityCoord',
      args: [player],
    })) as [number, number]
    return { x: Number(x), y: Number(y) }
  } catch {
    return null
  }
}

async function readCityStats(publicClient: PublicClient, player: `0x${string}`): Promise<CityStats | null> {
  try {
    const [level, power, defense] = (await publicClient.readContract({
      address: CITY_ADDRESS,
      abi: cityAbi,
      functionName: 'getCityStats',
      args: [player],
    })) as [number, bigint, bigint]

    return { level: Number(level), power, defense }
  } catch {
    return null
  }
}

async function sumArmyFromHeroIds(
  publicClient: PublicClient,
  player: `0x${string}`,
): Promise<ArmySum> {
  const ids = (await publicClient.readContract({
    address: HERO_NFT_ADDRESS,
    abi: heroNftAbi,
    functionName: 'heroIdsOf',
    args: [player],
  })) as bigint[]

  if (!ids.length) return { atk: 0n, def_: 0n, hp: 0n, agi: 0n, lck: 0n }

  let atk = 0n
  let def_ = 0n
  let hp = 0n
  let agi = 0n
  let lck = 0n

  for (const id of ids) {
    const s = (await publicClient.readContract({
      address: HERO_NFT_ADDRESS,
      abi: heroNftAbi,
      functionName: 'totalStats',
      args: [id],
    })) as { atk: bigint; def_: bigint; hp: bigint; agi: bigint; lck: bigint }
    atk += BigInt(s.atk)
    def_ += BigInt(s.def_)
    hp += BigInt(s.hp)
    agi += BigInt(s.agi)
    lck += BigInt(s.lck)
  }

  return { atk, def_, hp, agi, lck }
}

async function loadMyBattleProfile(
  publicClient: PublicClient,
  addr: `0x${string}`,
): Promise<MyBattleProfile> {
  const [city, coord, army] = await Promise.all([
    readCityStats(publicClient, addr),
    readCityCoord(publicClient, addr),
    sumArmyFromHeroIds(publicClient, addr),
  ])
  return { city, coord, army }
}

async function fetchPvPTargets(
  publicClient: PublicClient,
  myAddress: `0x${string}` | undefined,
): Promise<{ cards: TargetCard[]; status: string; myCoord: CityCoord | null }> {
  const owners = (await publicClient.readContract({
    address: CITY_ADDRESS,
    abi: cityAbi,
    functionName: 'getAllCityOwners',
    args: [],
  })) as `0x${string}`[]

  const players = myAddress ? owners.filter((p) => !addrEq(p, myAddress)) : owners

  if (!players.length) {
    const myCoord = myAddress ? await readCityCoord(publicClient, myAddress) : null
    return { cards: [], status: 'No other cities yet.', myCoord }
  }

  const myCoord = myAddress ? await readCityCoord(publicClient, myAddress) : null

  const cards: TargetCard[] = []
  for (const p of players) {
    const city = await readCityStats(publicClient, p)
    const coord = await readCityCoord(publicClient, p)
    if (!city || !coord) continue

    const distance = myCoord ? dist(myCoord.x, myCoord.y, coord.x, coord.y) : undefined

    const army = await sumArmyFromHeroIds(publicClient, p)

    cards.push({ player: p, distance, coord, city, army })
  }

  cards.sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0))
  return { cards, status: `Done. Cities shown: ${cards.length}.`, myCoord }
}

export default function PvPPage() {
  const { address, isConnected } = useAccount()
  const pathname = usePathname()
  const publicClient = usePublicClient()
  const { writeContractAsync } = useWriteContract()

  const pvpReady = isConfiguredAddress(PVP_BATTLES_ADDRESS)
  const heroReady = isConfiguredAddress(HERO_NFT_ADDRESS)
  const cityReady = isConfiguredAddress(CITY_ADDRESS)

  const [targets, setTargets] = useState<TargetCard[]>([])
  const targetsRef = useRef<TargetCard[]>([])
  targetsRef.current = targets
  const [myBattleProfile, setMyBattleProfile] = useState<MyBattleProfile | null>(null)
  const [status, setStatus] = useState('Open the page to find other cities.')
  const [hash, setHash] = useState<`0x${string}` | undefined>()
  const [myCoord, setMyCoord] = useState<CityCoord | null>(null)
  const [selected, setSelected] = useState<TargetCard | null>(null)
  const [activeMarch, setActiveMarch] = useState<ActiveMarch | null>(null)
  const activeMarchRef = useRef<ActiveMarch | null>(null)
  activeMarchRef.current = activeMarch
  const [nowSec, setNowSec] = useState(() => Math.floor(Date.now() / 1000))
  const chainNowBaseSecRef = useRef<number | null>(null)
  const chainNowBaseMsRef = useRef<number>(0)
  const [lockUntilStableSec, setLockUntilStableSec] = useState<number | null>(null)
  const [tournamentDeadlineStableSec, setTournamentDeadlineStableSec] = useState<number | null>(null)
  const [animMs, setAnimMs] = useState(() => Date.now())
  const lastAttackTx = useRef<`0x${string}` | null>(null)
  const appliedMarchForTx = useRef<`0x${string}` | null>(null)
  const lastChainMarchKey = useRef<string | null>(null)
  const [syncTick, setSyncTick] = useState(0)
  const [tournamentRows, setTournamentRows] = useState<TournamentRow[]>([])
  const [tournamentLoading, setTournamentLoading] = useState(false)
  const [tournamentRefreshSeq, setTournamentRefreshSeq] = useState(0)
  const [finalizeHash, setFinalizeHash] = useState<`0x${string}` | undefined>()
  const [mapTransform, setMapTransform] = useState({ tx: 0, ty: 0, s: 1 })
  const [mapIsPanning, setMapIsPanning] = useState(false)
  const mapTransformRef = useRef(mapTransform)
  mapTransformRef.current = mapTransform
  const mapSvgRef = useRef<SVGSVGElement>(null)
  const mapPanDragRef = useRef<{ pointerId: number; lastX: number; lastY: number } | null>(null)

  const { data: lockedUntil, refetch: refetchLockedUntil } = useReadContract({
    address: PVP_BATTLES_ADDRESS,
    abi: pvpBattlesAbi,
    functionName: 'attackerLockedUntil',
    args: address ? [address] : undefined,
    query: { enabled: !!address && pvpReady },
  })

  const { data: txReceipt, isLoading: txPending } = useWaitForTransactionReceipt({
    hash,
    query: { enabled: !!hash },
  })

  const { data: roundStartedAt, refetch: refetchRoundStarted } = useReadContract({
    address: PVP_BATTLES_ADDRESS,
    abi: pvpBattlesAbi,
    functionName: 'tournamentRoundStartedAt',
    query: { enabled: pvpReady },
  })

  const { data: tournamentPeriodSec } = useReadContract({
    address: PVP_BATTLES_ADDRESS,
    abi: pvpBattlesAbi,
    functionName: 'tournamentPeriodSeconds',
    query: { enabled: pvpReady },
  })

  const { data: tournamentRewardAmount } = useReadContract({
    address: PVP_BATTLES_ADDRESS,
    abi: pvpBattlesAbi,
    functionName: 'tournamentReward',
    query: { enabled: pvpReady },
  })

  const { data: mapSizeOnChain } = useReadContract({
    address: CITY_ADDRESS,
    abi: cityAbi,
    functionName: 'MAP_SIZE',
    query: { enabled: cityReady },
  })

  const { data: finalizeReceipt, isLoading: finalizePending } = useWaitForTransactionReceipt({
    hash: finalizeHash,
    query: { enabled: !!finalizeHash },
  })

  const lockUntilRawSec = toNumOrNull(lockedUntil)
  const cooldownSec =
    lockUntilStableSec !== null && lockUntilStableSec > 0 ? Math.max(0, lockUntilStableSec - nowSec) : 0
  const canAttack = isConnected && pvpReady && cooldownSec <= 0 && !txPending

  const roundStartRawSec = toNumOrNull(roundStartedAt)
  const periodSec = toNumOrNull(tournamentPeriodSec)
  const tournamentDeadlineRawSec =
    roundStartRawSec !== null && periodSec !== null ? roundStartRawSec + periodSec : null
  const canFinalizeTournament =
    tournamentDeadlineStableSec !== null && nowSec >= tournamentDeadlineStableSec && pvpReady && cityReady

  useEffect(() => {
    setLockUntilStableSec((prev) => {
      if (lockUntilRawSec !== null && Number.isFinite(lockUntilRawSec) && lockUntilRawSec > 0) {
        return Math.max(prev ?? 0, lockUntilRawSec)
      }
      if (prev !== null && nowSec < prev) {
        return prev
      }
      return null
    })
  }, [lockUntilRawSec, nowSec])

  useEffect(() => {
    setTournamentDeadlineStableSec((prev) => {
      if (
        tournamentDeadlineRawSec !== null &&
        Number.isFinite(tournamentDeadlineRawSec) &&
        tournamentDeadlineRawSec > 0
      ) {
        return Math.max(prev ?? 0, tournamentDeadlineRawSec)
      }
      if (prev !== null && nowSec < prev) {
        return prev
      }
      return null
    })
  }, [tournamentDeadlineRawSec, nowSec])

  const warning = useMemo(() => {
    const missing: string[] = []
    if (!pvpReady) missing.push('NEXT_PUBLIC_PVP_BATTLES_ADDRESS')
    if (!heroReady) missing.push('NEXT_PUBLIC_HERO_NFT_ADDRESS')
    if (!cityReady) missing.push('NEXT_PUBLIC_CITY_ADDRESS')
    return missing
  }, [cityReady, heroReady, pvpReady])

  const refreshTargetsAndProfile = useCallback(
    async ({ showLoading = false, syncSelected = false }: { showLoading?: boolean; syncSelected?: boolean } = {}) => {
      if (!cityReady || !publicClient) return
      if (showLoading) setStatus('Loading list of all cities...')

      const { cards, status: done, myCoord: nextMyCoord } = await fetchPvPTargets(publicClient, address)
      setTargets(cards)
      setMyCoord(nextMyCoord)

      if (address && heroReady) {
        setMyBattleProfile(await loadMyBattleProfile(publicClient, address))
      } else {
        setMyBattleProfile(null)
      }

      if (syncSelected) {
        setSelected((prev) => {
          if (!prev) return null
          const next = cards.find((c) => addrEq(c.player, prev.player)) ?? null
          if (address && next && addrEq(next.player, address)) return null
          return next
        })
      }

      setStatus(done)
    },
    [address, cityReady, heroReady, publicClient],
  )

  useEffect(() => {
    void refreshTargetsAndProfile({ showLoading: true })
  }, [refreshTargetsAndProfile])

  const loadTournamentLeaderboard = useCallback(async () => {
    if (!publicClient || !pvpReady || !cityReady) return
    setTournamentLoading(true)
    try {
      const owners = (await publicClient.readContract({
        address: CITY_ADDRESS,
        abi: cityAbi,
        functionName: 'getAllCityOwners',
        args: [],
      })) as `0x${string}`[]

      const rows: TournamentRow[] = await Promise.all(
        owners.map(async (player) => {
          const w = (await publicClient.readContract({
            address: PVP_BATTLES_ADDRESS,
            abi: pvpBattlesAbi,
            functionName: 'tournamentWins',
            args: [player],
          })) as bigint
          return { player, wins: Number(w) }
        }),
      )

      rows.sort((a, b) => {
        if (b.wins !== a.wins) return b.wins - a.wins
        return addrLower(a.player) < addrLower(b.player) ? -1 : 1
      })

      setTournamentRows(rows)
    } finally {
      setTournamentLoading(false)
    }
  }, [publicClient, pvpReady, cityReady])

  useEffect(() => {
    if (!publicClient || !pvpReady || !cityReady) return
    void loadTournamentLeaderboard()
    const id = window.setInterval(
      () => void loadTournamentLeaderboard(),
      TOURNAMENT_LEADERBOARD_REFRESH_MS,
    )
    return () => window.clearInterval(id)
  }, [loadTournamentLeaderboard, publicClient, pvpReady, cityReady, tournamentRefreshSeq])

  useEffect(() => {
    if (!finalizeReceipt) return
    if (finalizeReceipt.status === 'success') {
      setTournamentRefreshSeq((n) => n + 1)
      void refetchRoundStarted()
    }
    setFinalizeHash(undefined)
  }, [finalizeReceipt, refetchRoundStarted])

  useEffect(() => {
    if (!cityReady || !publicClient) return
    const id = window.setInterval(
      () => void refreshTargetsAndProfile({ syncSelected: true }),
      15_000,
    )
    return () => window.clearInterval(id)
  }, [cityReady, publicClient, refreshTargetsAndProfile])

  useEffect(() => {
    if (!publicClient) return

    let tickId = 0
    let syncId = 0
    let cancelled = false

    async function syncChainNow() {
      try {
        const block = await publicClient.getBlock()
        if (cancelled) return
        const ts = Number(block.timestamp)
        if (Number.isFinite(ts) && ts > 0) {
          const nowMs = Date.now()
          const prevBaseSec = chainNowBaseSecRef.current ?? 0
          const prevBaseMs = chainNowBaseMsRef.current
          const prevDerived =
            prevBaseSec > 0 && prevBaseMs > 0
              ? prevBaseSec + Math.floor((nowMs - prevBaseMs) / 1000)
              : 0
          const safeTs = Math.max(ts, prevDerived)
          chainNowBaseSecRef.current = safeTs
          chainNowBaseMsRef.current = nowMs
          setNowSec((prev) => {
            const localNow = Math.floor(nowMs / 1000)
            const floorPrev = Number.isFinite(prev) ? prev : localNow
            return Math.max(floorPrev, localNow, safeTs)
          })
        }
      } catch {
      }
    }

    void syncChainNow()

    tickId = window.setInterval(() => {
      setNowSec((prev) => {
        const nowMs = Date.now()
        const baseSec = chainNowBaseSecRef.current ?? 0
        const baseMs = chainNowBaseMsRef.current
        const fromChain =
          baseSec > 0 && baseMs > 0 ? baseSec + Math.floor((nowMs - baseMs) / 1000) : 0
        const fallback = Math.floor(nowMs / 1000)
        const floorPrev = Number.isFinite(prev) ? prev : fallback
        return Math.max(floorPrev, fromChain, fallback)
      })
    }, 1000)

    syncId = window.setInterval(() => void syncChainNow(), 10_000)

    return () => {
      cancelled = true
      window.clearInterval(tickId)
      window.clearInterval(syncId)
    }
  }, [publicClient])

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible') setSyncTick((n) => n + 1)
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  useEffect(() => {
    setActiveMarch(null)
    setHash(undefined)
    appliedMarchForTx.current = null
    lastAttackTx.current = null
    lastChainMarchKey.current = null
  }, [address])

  useEffect(() => {
    if (!address) return
    setSelected((prev) => {
      if (!prev) return null
      return addrEq(prev.player, address) ? null : prev
    })
  }, [address])

  useEffect(() => {
    if (!activeMarch) return

    let raf = 0
    const tick = () => {
      setAnimMs(Date.now())
      raf = window.requestAnimationFrame(tick)
    }
    raf = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(raf)
  }, [activeMarch])

  useEffect(() => {
    if (!address || !publicClient || !pvpReady || !cityReady) return
    if (pathname !== '/pvp') return
    if (txPending && hash) return

    let cancelled = false

    async function syncFromChain() {
      const untilBn = (await publicClient.readContract({
        address: PVP_BATTLES_ADDRESS,
        abi: pvpBattlesAbi,
        functionName: 'attackerLockedUntil',
        args: [address],
      })) as bigint
      let until = Number(untilBn)
      let now = Math.floor(Date.now() / 1000)

      void refetchLockedUntil()

      let cooldownExpired =
        !Number.isFinite(until) || until <= 0 || until <= now
      if (cooldownExpired) {
        const untilBn2 = (await publicClient.readContract({
          address: PVP_BATTLES_ADDRESS,
          abi: pvpBattlesAbi,
          functionName: 'attackerLockedUntil',
          args: [address],
        })) as bigint
        const until2 = Number(untilBn2)
        const now2 = Math.floor(Date.now() / 1000)
        cooldownExpired =
          !Number.isFinite(until2) || until2 <= 0 || until2 <= now2
        if (cooldownExpired) {
          if (!cancelled) {
            lastChainMarchKey.current = null
            setActiveMarch(null)
            storageRemove(marchStorageKey(address))
          }
          return
        }
        until = until2
        now = now2
      }

      const fromCoord = await readCityCoord(publicClient, address)
      if (!fromCoord) return

      let ids: bigint[]
      try {
        ids = (await publicClient.readContract({
          address: PVP_BATTLES_ADDRESS,
          abi: pvpBattlesAbi,
          functionName: 'playerBattleIds',
          args: [address],
        })) as bigint[]
      } catch {
        return
      }
      if (!ids.length) return

      type BattleRow = [bigint, `0x${string}`, `0x${string}`, `0x${string}`, `0x${string}`, bigint]
      let bestId: bigint | null = null
      let bestRow: BattleRow | null = null
      for (const id of ids) {
        const row = (await publicClient.readContract({
          address: PVP_BATTLES_ADDRESS,
          abi: pvpBattlesAbi,
          functionName: 'battles',
          args: [id],
        })) as BattleRow
        const attacker = row[1]
        if (!addrEq(attacker, address)) continue
        if (!bestId || id > bestId) {
          bestId = id
          bestRow = row
        }
      }
      if (!bestRow) return

      const ts = Number(bestRow[0])
      const defender = bestRow[2]
      const durationSec = until - ts
      if (!Number.isFinite(ts) || !Number.isFinite(durationSec) || durationSec <= 0 || durationSec > 86400) return

      const toCoord = await readCityCoord(publicClient, defender)
      if (!toCoord) return

      const marchKey = `${addrLower(defender)}-${ts}-${durationSec}`
      if (!cancelled) {
        if (lastChainMarchKey.current === marchKey) {
          return
        }
        lastChainMarchKey.current = marchKey
        const startMs = ts * 1000
        setAnimMs(Date.now())
        setActiveMarch({
          from: fromCoord,
          to: toCoord,
          startMs,
          durationSec,
          defender,
          marchKey,
        })
      const target = targetsRef.current.find((t) => addrEq(t.player, defender))
        if (target) setSelected(target)
      }
    }

    void syncFromChain()
    return () => {
      cancelled = true
    }
  }, [
    address,
    cityReady,
    pathname,
    publicClient,
    pvpReady,
    refetchLockedUntil,
    syncTick,
    txPending,
    hash,
  ])

  async function attack(player: `0x${string}`) {
    try {
      const tx = await writeContractAsync({
        address: PVP_BATTLES_ADDRESS,
        abi: pvpBattlesAbi,
        functionName: 'attack',
        args: [player],
      })
      lastAttackTx.current = tx
      setHash(tx)
    } catch (err) {
      lastChainMarchKey.current = null
      setActiveMarch(null)
      if (address) storageRemove(marchStorageKey(address))
      throw err
    }
  }

  async function finalizeTournamentRound() {
    const tx = await writeContractAsync({
      address: PVP_BATTLES_ADDRESS,
      abi: pvpBattlesAbi,
      functionName: 'finalizeTournament',
    })
    setFinalizeHash(tx)
  }

  useEffect(() => {
    if (!txReceipt || !hash || !publicClient || !address) return
    if (!lastAttackTx.current || lastAttackTx.current !== hash) return
    if (appliedMarchForTx.current === hash) return

    async function run() {
      if (txReceipt.status === 'reverted') {
        appliedMarchForTx.current = hash
        lastChainMarchKey.current = null
        setActiveMarch(null)
        if (address) storageRemove(marchStorageKey(address))
        return
      }

      let attacked:
        | { battleId: bigint; attacker: `0x${string}`; defender: `0x${string}`; travelTimeSeconds: bigint }
        | null = null

      for (const l of txReceipt.logs) {
        if (!addrEq(l.address, PVP_BATTLES_ADDRESS)) continue
        try {
          const decoded = decodeEventLog({
            abi: pvpBattlesAbi,
            data: l.data,
            topics: l.topics,
          })
          if (decoded.eventName !== 'Attacked') continue
          const args = decoded.args as {
            battleId: bigint
            attacker: `0x${string}`
            defender: `0x${string}`
            travelTimeSeconds: bigint
          }
          attacked = args
          break
        } catch {
        }
      }

      if (!attacked) return
      if (!addrEq(attacked.attacker, address)) return

      const fromCoord = await readCityCoord(publicClient, address)
      if (!fromCoord) return

      const target = targets.find((t) => addrEq(t.player, attacked.defender))
      let toCoord = target?.coord ?? null
      if (!toCoord) {
        toCoord = await readCityCoord(publicClient, attacked.defender)
      }
      if (!toCoord) return

      const block = await publicClient.getBlock({ blockNumber: txReceipt.blockNumber })
      const chainStartMs = Number(block.timestamp) * 1000
      const durationSec = Number(attacked.travelTimeSeconds)
      const tsSec = Number(block.timestamp)

      const payload: StoredMarch = {
        attacker: address,
        defender: attacked.defender,
        startMs: chainStartMs,
        durationSec,
      }
      if (address) storageSet(marchStorageKey(address), JSON.stringify(payload))

      const marchKey = `${addrLower(attacked.defender)}-${tsSec}-${durationSec}`
      if (lastChainMarchKey.current === marchKey) {
        appliedMarchForTx.current = hash
        void refetchLockedUntil()
        return
      }

      appliedMarchForTx.current = hash
      lastChainMarchKey.current = marchKey

      const startMs = chainStartMs
      setAnimMs(Date.now())
      setActiveMarch({
        from: fromCoord,
        to: toCoord,
        startMs,
        durationSec,
        defender: attacked.defender,
        marchKey,
      })
      if (target) setSelected(target)

      void refetchLockedUntil()
    }

    void run()
  }, [address, hash, publicClient, refetchLockedUntil, targets, txReceipt])

  const mapModel = useMemo(() => {
    const mapSize = mapSizeOnChain !== undefined && mapSizeOnChain !== null ? Number(mapSizeOnChain) : 100
    const edge = 2
    const scalePerCell = 10
    const coordDenom = Math.max(1, (mapSize - 1) + edge * 2)
    const w = coordDenom * scalePerCell
    const h = coordDenom * scalePerCell
    const pad = edge * scalePerCell
    const toSvg = (c: CityCoord) => {
      const x = (c.x + edge) * scalePerCell
      const y = (c.y + edge) * scalePerCell
      return { x, y }
    }

    return { w, h, pad, toSvg }
  }, [mapSizeOnChain])

  const armyReturnAtFormatted = useMemo(() => {
    if (!activeMarch) return null
    const ms = activeMarch.startMs + activeMarch.durationSec * 1000
    return formatDateTime(ms)
  }, [activeMarch])

  const nextAttackAtFormatted =
    !activeMarch && lockUntilStableSec !== null && lockUntilStableSec > nowSec
      ? formatDateTime(lockUntilStableSec * 1000)
      : null

  const tournamentEndsAtFormatted =
    tournamentDeadlineStableSec !== null
      ? formatDateTime(tournamentDeadlineStableSec * 1000)
      : null

  const attackAnim = useMemo(() => {
    if (!activeMarch) return null
    const elapsedSec = Math.max(0, (animMs - activeMarch.startMs) / 1000)
    const total = Math.max(0.001, activeMarch.durationSec)
    const half = total / 2
    const done = elapsedSec >= total
    const forward = elapsedSec <= half
    const t = forward
      ? Math.min(1, elapsedSec / half)
      : Math.max(0, 1 - Math.min(1, (elapsedSec - half) / half))
    const from = mapModel.toSvg(activeMarch.from)
    const to = mapModel.toSvg(activeMarch.to)
    const x = from.x + (to.x - from.x) * t
    const y = from.y + (to.y - from.y) * t
    return { x, y, from, to, done }
  }, [activeMarch, animMs, mapModel])

  const clientToMapSvg = useCallback(
    (ev: { clientX: number; clientY: number }) => {
      const svg = mapSvgRef.current
      if (!svg) return { x: mapModel.w / 2, y: mapModel.h / 2 }
      const pt = svg.createSVGPoint()
      pt.x = ev.clientX
      pt.y = ev.clientY
      const ctm = svg.getScreenCTM()
      if (!ctm) return { x: mapModel.w / 2, y: mapModel.h / 2 }
      const p = pt.matrixTransform(ctm.inverse())
      return { x: p.x, y: p.y }
    },
    [mapModel.h, mapModel.w],
  )

  useEffect(() => {
    const svg = mapSvgRef.current
    if (!svg) return

    const onWheel = (ev: WheelEvent) => {
      ev.preventDefault()
      const pt = svg.createSVGPoint()
      pt.x = ev.clientX
      pt.y = ev.clientY
      const ctm = svg.getScreenCTM()
      if (!ctm) return
      const loc = pt.matrixTransform(ctm.inverse())
      const { tx, ty, s } = mapTransformRef.current
      const factor = ev.deltaY < 0 ? MAP_ZOOM_STEP : 1 / MAP_ZOOM_STEP
      const newS = Math.min(MAP_ZOOM_MAX, Math.max(MAP_ZOOM_MIN, s * factor))
      const newTx = loc.x - (newS / s) * (loc.x - tx)
      const newTy = loc.y - (newS / s) * (loc.y - ty)
      setMapTransform({ tx: newTx, ty: newTy, s: newS })
    }

    svg.addEventListener('wheel', onWheel, { passive: false })
    return () => svg.removeEventListener('wheel', onWheel)
  }, [])

  const zoomMapAt = useCallback((cx: number, cy: number, factor: number) => {
    setMapTransform((prev) => {
      const newS = Math.min(MAP_ZOOM_MAX, Math.max(MAP_ZOOM_MIN, prev.s * factor))
      return {
        s: newS,
        tx: cx - (newS / prev.s) * (cx - prev.tx),
        ty: cy - (newS / prev.s) * (cy - prev.ty),
      }
    })
  }, [])

  const resetMapView = useCallback(() => setMapTransform({ tx: 0, ty: 0, s: 1 }), [])

  const handleMapPointerDown = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (e.button !== 0) return
      const target = e.target as Element
      if (!target.closest('[data-map-pan]')) return
      e.currentTarget.setPointerCapture(e.pointerId)
      const p = clientToMapSvg(e.nativeEvent)
      mapPanDragRef.current = { pointerId: e.pointerId, lastX: p.x, lastY: p.y }
      setMapIsPanning(true)
    },
    [clientToMapSvg],
  )

  const handleMapPointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      const d = mapPanDragRef.current
      if (!d || d.pointerId !== e.pointerId) return
      const p = clientToMapSvg(e.nativeEvent)
      const dx = p.x - d.lastX
      const dy = p.y - d.lastY
      d.lastX = p.x
      d.lastY = p.y
      setMapTransform((prev) => ({ ...prev, tx: prev.tx + dx, ty: prev.ty + dy }))
    },
    [clientToMapSvg],
  )

  const handleMapPointerUp = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (mapPanDragRef.current?.pointerId === e.pointerId) {
      mapPanDragRef.current = null
      setMapIsPanning(false)
    }
  }, [])

  const mapMatrix = `matrix(${mapTransform.s},0,0,${mapTransform.s},${mapTransform.tx},${mapTransform.ty})`

  return (
    <main style={{ padding: '10px 24px 24px' }}>
      <div style={{ marginBottom: 16 }}>
        <Navbar />
      </div>

      {warning.length > 0 && (
        <div style={notice}>
          Missing environment variables: <code>{warning.join(', ')}</code>
        </div>
      )}

      {!isConnected && (
        <div style={notice}>
          Connect wallet to see cooldown and attack.
        </div>
      )}

      <section style={battlefield}>
        <div style={battlefieldBackdrop} />
        <div style={mapWrap}>
          <svg
            ref={mapSvgRef}
            width="100%"
            viewBox={`0 0 ${mapModel.w} ${mapModel.h}`}
            style={{ display: 'block', touchAction: 'none', cursor: mapIsPanning ? 'grabbing' : 'default' }}
            onPointerDown={handleMapPointerDown}
            onPointerMove={handleMapPointerMove}
            onPointerUp={handleMapPointerUp}
            onPointerLeave={handleMapPointerUp}
            onPointerCancel={handleMapPointerUp}
          >
            <defs>
              <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#b4df74" />
                <stop offset="0.36" stopColor="#8cc955" />
                <stop offset="1" stopColor="#72b13f" />
              </linearGradient>

              <linearGradient id="gRoof" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#d9f99d" />
                <stop offset="1" stopColor="#84cc16" />
              </linearGradient>
              <linearGradient id="gWallL" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#bbf7d0" />
                <stop offset="1" stopColor="#22c55e" />
              </linearGradient>
              <linearGradient id="gWallR" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#86efac" />
                <stop offset="1" stopColor="#16a34a" />
              </linearGradient>

              <linearGradient id="rRoof" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#fecaca" />
                <stop offset="1" stopColor="#ef4444" />
              </linearGradient>
              <linearGradient id="rWallL" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#fee2e2" />
                <stop offset="1" stopColor="#fb7185" />
              </linearGradient>
              <linearGradient id="rWallR" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#fda4af" />
                <stop offset="1" stopColor="#b91c1c" />
              </linearGradient>
            </defs>

            <g transform={mapMatrix}>
              <rect
                data-map-pan=""
                x="0"
                y="0"
                width={mapModel.w}
                height={mapModel.h}
                rx="18"
                fill="url(#bg)"
                stroke="rgba(120, 168, 69, 0.9)"
                style={{ cursor: 'grab' }}
              />

              <g style={{ pointerEvents: 'none' }}>
                <rect
                  x="0"
                  y="0"
                  width={mapModel.w}
                  height={mapModel.h}
                  rx="18"
                  fill="radial-gradient(circle at 50% 12%, rgba(255,255,255,0.16), rgba(0,0,0,0) 22%)"
                  opacity="0.22"
                />
              </g>

              <g data-map-pan="" style={{ cursor: 'grab' }}>
                <rect
                  x={mapModel.pad}
                  y={mapModel.pad}
                  width={mapModel.w - mapModel.pad * 2}
                  height={mapModel.h - mapModel.pad * 2}
                  fill="none"
                  stroke="rgba(61, 118, 34, 0.55)"
                  opacity="0.22"
                />
                {Array.from({ length: 11 }, (_, i) => {
                  const t = i / 10
                  const x = mapModel.pad + t * (mapModel.w - mapModel.pad * 2)
                  const y = mapModel.pad + t * (mapModel.h - mapModel.pad * 2)
                  return (
                    <g key={i} opacity="0.22">
                      <line
                        x1={x}
                        y1={mapModel.pad}
                        x2={x}
                        y2={mapModel.h - mapModel.pad}
                        stroke="rgba(61, 118, 34, 0.55)"
                      />
                      <line
                        x1={mapModel.pad}
                        y1={y}
                        x2={mapModel.w - mapModel.pad}
                        y2={y}
                        stroke="rgba(61, 118, 34, 0.55)"
                      />
                    </g>
                  )
                })}
              </g>

              {myCoord &&
                (() => {
                  const p = mapModel.toSvg(myCoord)
                  return (
                    <g style={{ cursor: 'default' }}>
                      <g transform={`translate(${p.x},${p.y})`}>
                        <g opacity="0.95" transform="translate(8,2)">
                          <g transform="translate(-10,-10) scale(0.95)">
                            <polygon points="0,-14 14,-7 0,0 -14,-7" fill="url(#gRoof)" stroke="rgba(2,6,23,0.25)" strokeWidth="1" />
                            <polygon points="-14,-7 0,0 0,14 -14,7" fill="url(#gWallL)" stroke="rgba(2,6,23,0.18)" strokeWidth="1" />
                            <polygon points="14,-7 0,0 0,14 14,7" fill="url(#gWallR)" stroke="rgba(2,6,23,0.18)" strokeWidth="1" />
                          </g>
                          <g transform="translate(10,-10) scale(1.0)">
                            <polygon points="0,-14 14,-7 0,0 -14,-7" fill="url(#gRoof)" stroke="rgba(2,6,23,0.25)" strokeWidth="1" />
                            <polygon points="-14,-7 0,0 0,14 -14,7" fill="url(#gWallL)" stroke="rgba(2,6,23,0.18)" strokeWidth="1" />
                            <polygon points="14,-7 0,0 0,14 14,7" fill="url(#gWallR)" stroke="rgba(2,6,23,0.18)" strokeWidth="1" />
                          </g>
                          <g transform="translate(0,6) scale(1.12)">
                            <polygon points="0,-14 14,-7 0,0 -14,-7" fill="url(#gRoof)" stroke="rgba(2,6,23,0.28)" strokeWidth="1" />
                            <polygon points="-14,-7 0,0 0,14 -14,7" fill="url(#gWallL)" stroke="rgba(2,6,23,0.2)" strokeWidth="1" />
                            <polygon points="14,-7 0,0 0,14 14,7" fill="url(#gWallR)" stroke="rgba(2,6,23,0.2)" strokeWidth="1" />
                          </g>
                        </g>
                      </g>
                      <text x={p.x + 20} y={p.y - 2} fill="#052e16" fontSize="13" fontWeight="900">
                        Your city
                      </text>
                    </g>
                  )
                })()}

              {targets
                .filter((t) => !address || !addrEq(t.player, address))
                .map((t) => {
                  if (!t.coord) return null
                  const p = mapModel.toSvg(t.coord)
                  const isSel = addrEq(selected?.player, t.player)
                  return (
                    <g key={t.player} style={{ cursor: 'pointer' }} onClick={() => setSelected(t)}>
                      <g transform={`translate(${p.x},${p.y}) scale(${isSel ? 1.1 : 1})`}>
                        <g opacity="0.95" transform="translate(8,2)">
                          <g transform="translate(-10,-10) scale(0.95)">
                            <polygon points="0,-14 14,-7 0,0 -14,-7" fill="url(#rRoof)" stroke="rgba(2,6,23,0.25)" strokeWidth="1" />
                            <polygon points="-14,-7 0,0 0,14 -14,7" fill="url(#rWallL)" stroke="rgba(2,6,23,0.18)" strokeWidth="1" />
                            <polygon points="14,-7 0,0 0,14 14,7" fill="url(#rWallR)" stroke="rgba(2,6,23,0.18)" strokeWidth="1" />
                          </g>
                          <g transform="translate(10,-10) scale(1.0)">
                            <polygon points="0,-14 14,-7 0,0 -14,-7" fill="url(#rRoof)" stroke="rgba(2,6,23,0.25)" strokeWidth="1" />
                            <polygon points="-14,-7 0,0 0,14 -14,7" fill="url(#rWallL)" stroke="rgba(2,6,23,0.18)" strokeWidth="1" />
                            <polygon points="14,-7 0,0 0,14 14,7" fill="url(#rWallR)" stroke="rgba(2,6,23,0.18)" strokeWidth="1" />
                          </g>
                          <g transform="translate(0,6) scale(1.12)">
                            <polygon points="0,-14 14,-7 0,0 -14,-7" fill="url(#rRoof)" stroke="rgba(2,6,23,0.28)" strokeWidth="1" />
                            <polygon points="-14,-7 0,0 0,14 -14,7" fill="url(#rWallL)" stroke="rgba(2,6,23,0.2)" strokeWidth="1" />
                            <polygon points="14,-7 0,0 0,14 14,7" fill="url(#rWallR)" stroke="rgba(2,6,23,0.2)" strokeWidth="1" />
                          </g>
                        </g>
                      </g>
                      <text x={p.x + 20} y={p.y - 2} fill="#3b2200" fontSize="12" fontWeight="900">
                        {short(t.player)}
                      </text>
                      <text
                        x={p.x + 20}
                        y={p.y + 14}
                        fill="rgba(2, 6, 23, 0.82)"
                        fontSize="12"
                        fontWeight="700"
                      >
                        lvl {t.city?.level ?? '—'} · d {t.distance ?? '—'}
                      </text>
                    </g>
                  )
                })}

              {attackAnim && activeMarch && (
                <g style={{ pointerEvents: 'none' }}>
                  <line
                    x1={attackAnim.from.x}
                    y1={attackAnim.from.y}
                    x2={attackAnim.to.x}
                    y2={attackAnim.to.y}
                    stroke="#0b1222"
                    strokeWidth="4"
                    opacity="0.28"
                    strokeDasharray="7 9"
                  />
                  <line
                    x1={attackAnim.from.x}
                    y1={attackAnim.from.y}
                    x2={attackAnim.to.x}
                    y2={attackAnim.to.y}
                    stroke="#fbbf24"
                    strokeWidth="2.5"
                    opacity="0.95"
                    strokeDasharray="7 9"
                    strokeLinecap="round"
                  />
                  <text
                    x={attackAnim.x}
                    y={attackAnim.y}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize="20"
                    style={{ filter: 'drop-shadow(0 8px 10px rgba(2, 6, 23, 0.25))' }}
                  >
                    ⚔️
                  </text>
                </g>
              )}
            </g>
          </svg>
        </div>

        <div style={mapZoomBarFloating}>
          <button
            type="button"
            style={mapZoomBtn}
            title="Zoom out"
            onClick={() => zoomMapAt(mapModel.w / 2, mapModel.h / 2, 1 / MAP_ZOOM_STEP)}
          >
            −
          </button>
          <button type="button" style={mapZoomBtn} title="Reset view" onClick={() => resetMapView()}>
            1∶1
          </button>
          <button
            type="button"
            style={mapZoomBtn}
            title="Zoom in"
            onClick={() => zoomMapAt(mapModel.w / 2, mapModel.h / 2, MAP_ZOOM_STEP)}
          >
            +
          </button>
          <span style={mapZoomHint}>{Math.round(mapTransform.s * 100)}%</span>
        </div>

        <section style={{ ...panel, ...panelOverlayLeft }}>
          <h2 style={{ marginTop: 0 }}>PvP Panel</h2>
          <div style={{ marginBottom: 8 }}>Address: {short(address)}</div>
          <div style={{ marginBottom: 8, fontSize: 13, opacity: 0.85 }}>
            Coordinates:{' '}
            {myBattleProfile?.coord ? `${myBattleProfile.coord.x}, ${myBattleProfile.coord.y}` : '—'}
          </div>

          {isConnected && address && cityReady && heroReady && (
            <div style={{ marginBottom: 16 }}>
              {myBattleProfile ? (
                <>
                  <div style={{ ...mini, marginBottom: 10, marginLeft: -6 }}>
                    <div style={{ fontSize: 12, opacity: 0.7 }}>Your city</div>
                    <div>Level: {myBattleProfile.city?.level ?? '—'}</div>
                    <div>Power: {myBattleProfile.city ? formatEther(myBattleProfile.city.power) : '—'}</div>
                    <div>Defense: {myBattleProfile.city ? formatEther(myBattleProfile.city.defense) : '—'}</div>
                  </div>
                  <div style={{ ...mini, marginLeft: -6 }}>
                    <div style={{ fontSize: 12, opacity: 0.7 }}>Your heroes</div>
                    <div>Attack: {myBattleProfile.army.atk.toString()}</div>
                    <div>Defense: {myBattleProfile.army.def_.toString()}</div>
                    <div>Health: {myBattleProfile.army.hp.toString()}</div>
                    <div>Agility: {myBattleProfile.army.agi.toString()}</div>
                    <div>Luck: {myBattleProfile.army.lck.toString()}</div>
                  </div>
                </>
              ) : (
                <div style={{ fontSize: 13, opacity: 0.8 }}>Loading city and army...</div>
              )}
            </div>
          )}

          {armyReturnAtFormatted && (
            <div style={{ marginBottom: 14, fontSize: 13, lineHeight: 1.45, opacity: 0.92 }}>
              <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Army returns at:</div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{armyReturnAtFormatted}</div>
            </div>
          )}

          {!armyReturnAtFormatted && (
            <div style={{ marginBottom: 14, fontSize: 13, lineHeight: 1.45, opacity: 0.92 }}>
              <div style={{ fontSize: 12, opacity: 0.72, marginBottom: 4 }}>
                {nextAttackAtFormatted ? 'Next attack not earlier than' : 'Attack status'}
              </div>
              <div style={{ fontWeight: 700 }}>{nextAttackAtFormatted ?? 'Attack available'}</div>
            </div>
          )}

          <div style={{ marginTop: 16, opacity: 0.9 }}>{status}</div>

          {hash && (
            <div style={{ marginTop: 16, fontSize: 12, opacity: 0.8, wordBreak: 'break-all' }}>
              Transaction: {hash}
            </div>
          )}
        </section>

        <aside style={{ ...side, ...panelOverlayRight }}>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>Selected city</div>
          {!selected && (
            <div style={{ opacity: 0.85, fontSize: 13 }}>
              Click a red city on the map to view details and attack.
            </div>
          )}

          {selected && (
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ fontSize: 12, opacity: 0.75 }}>Player</div>
              <div style={{ fontWeight: 800 }}>{short(selected.player)}</div>
              <div style={{ fontSize: 12, opacity: 0.7, wordBreak: 'break-all' }}>{selected.player}</div>

              <div style={{ display: 'grid', gap: 8 }}>
                <div style={{ fontSize: 13, opacity: 0.9 }}>
                  Distance: <b>{selected.distance ?? '—'}</b>
                </div>
                <div style={{ fontSize: 13, opacity: 0.9 }}>
                  Coordinates: <b>{selected.coord ? `${selected.coord.x}, ${selected.coord.y}` : '—'}</b>
                </div>
              </div>

              <div style={{ ...mini, marginLeft: -6 }}>
                <div style={{ fontSize: 12, opacity: 0.7 }}>City</div>
                <div>Level: {selected.city?.level ?? '—'}</div>
                <div>Power: {selected.city ? formatEther(selected.city.power) : '—'}</div>
                <div>Defense: {selected.city ? formatEther(selected.city.defense) : '—'}</div>
              </div>
              <div style={{ ...mini, marginLeft: -6 }}>
                <div style={{ fontSize: 12, opacity: 0.7 }}>Heroes</div>
                <div>Attack: {selected.army?.atk?.toString() ?? '—'}</div>
                <div>Defense: {selected.army?.def_?.toString() ?? '—'}</div>
                <div>Health: {selected.army?.hp?.toString() ?? '—'}</div>
                <div>Agility: {selected.army?.agi?.toString() ?? '—'}</div>
                <div>Luck: {selected.army?.lck?.toString() ?? '—'}</div>
              </div>

              <button
                type="button"
                onClick={() => void attack(selected.player)}
                disabled={!canAttack || !selected}
                style={canAttack ? btn : btnDisabled}
              >
                Attack
              </button>
            </div>
          )}

          {targets.length === 0 && (
            <div style={{ marginTop: 12, opacity: 0.8 }}>
              No targets. Other players need to create cities.
            </div>
          )}
        </aside>
      </section>

      <section style={{ ...panel, marginTop: 24 }}>
        <h2 style={{ marginTop: 0 }}>Tournament leaderboard</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center', marginBottom: 14 }}>
          <div style={{ fontSize: 14 }}>
            {periodSec !== null && tournamentRewardAmount !== undefined ? (
              <>
                1st place reward: <b>{formatEther(tournamentRewardAmount)}</b> YNGK · tournament duration:{' '}
                <b>{formatDuration(periodSec)}</b>
              </>
            ) : (
              <span style={{ opacity: 0.75 }}>Loading tournament params...</span>
            )}
          </div>
          <div style={{ fontSize: 14 }}>
            {tournamentEndsAtFormatted !== null ? (
              <>
                Tournament ends at: <b>{tournamentEndsAtFormatted}</b>
                {canFinalizeTournament && (
                  <span style={{ color: '#86efac' }}> · Round ended — finalize and distribute reward.</span>
                )}
              </>
            ) : (
              <span style={{ opacity: 0.75 }}>Timer unavailable</span>
            )}
          </div>
          <button
            type="button"
            onClick={() => void finalizeTournamentRound()}
            disabled={!isConnected || !canFinalizeTournament || finalizePending || !pvpReady}
            style={{
              ...btnAlt,
              opacity: !isConnected || !canFinalizeTournament || finalizePending ? 0.5 : 1,
              cursor:
                !isConnected || !canFinalizeTournament || finalizePending ? 'not-allowed' : 'pointer',
            }}
          >
            {finalizePending ? 'Waiting for confirmation...' : 'Finalize tournament'}
          </button>
        </div>

        {finalizeHash && (
          <div style={{ marginBottom: 12, fontSize: 12, opacity: 0.8, wordBreak: 'break-all' }}>
            Finalize transaction: {finalizeHash}
          </div>
        )}

        <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 8 }}>
          {tournamentLoading ? 'Refreshing leaderboard...' : `Participants: ${tournamentRows.length}`}
        </div>

        <div style={tournamentTableScroll}>
          <table style={tournamentTable}>
            <thead>
              <tr>
                <th style={th}>Place</th>
                <th style={th}>Address</th>
                <th style={{ ...th, textAlign: 'right' as const }}>Wins</th>
              </tr>
            </thead>
            <tbody>
              {tournamentRows.length === 0 && (
                <tr>
                  <td colSpan={3} style={{ ...td, opacity: 0.8 }}>
                    No city owners yet or data is still loading.
                  </td>
                </tr>
              )}
              {tournamentRows.map((row, i) => {
                const isYou = !!address && addrEq(row.player, address)
                return (
                  <tr key={row.player} style={isYou ? rowHighlight : undefined}>
                    <td style={td}>{i + 1}</td>
                    <td style={{ ...td, fontFamily: 'ui-monospace, monospace', fontSize: 12 }}>
                      <span title={row.player}>{short(row.player)}</span>
                      <div style={{ fontSize: 11, opacity: 0.65, wordBreak: 'break-all' }}>{row.player}</div>
                    </td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{row.wins}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  )
}

const panel: CSSProperties = {
  background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.90), rgba(30, 41, 59, 0.78))',
  border: '1px solid rgba(34, 211, 153, 0.18)',
  borderRadius: 22,
  padding: 18,
  backdropFilter: 'blur(12px)',
  boxShadow: '0 28px 60px rgba(2, 6, 23, 0.28)',
  color: '#f8fafc',
}

const notice: CSSProperties = {
  padding: 16,
  border: '1px solid rgba(148, 163, 184, 0.28)',
  borderRadius: 18,
  background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.92), rgba(30, 41, 59, 0.84))',
  boxShadow: '0 18px 34px rgba(2, 6, 23, 0.22)',
  marginBottom: 12,
}

const card: CSSProperties = {
  background: '#0f172a',
  border: '1px solid #334155',
  borderRadius: 16,
  padding: 14,
  display: 'grid',
  gap: 10,
}

const mini: CSSProperties = {
  background: 'rgba(15, 23, 42, 0.72)',
  border: '1px solid rgba(148, 163, 184, 0.22)',
  borderRadius: 16,
  padding: 12,
  fontSize: 13,
}

const mapWrap: CSSProperties = {
  position: 'relative',
  zIndex: 1,
  borderRadius: 24,
  overflow: 'hidden',
  border: '1px solid rgba(120, 168, 69, 0.55)',
  background: 'linear-gradient(180deg, #b4df74 0%, #8cc955 36%, #72b13f 100%)',
  height: 'min(78vh, 860px)',
  minHeight: 640,
  boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.22), 0 24px 60px rgba(2, 6, 23, 0.22)',
}

const mapZoomBar: CSSProperties = {
  position: 'absolute',
  top: 10,
  right: 10,
  zIndex: 2,
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '6px 8px',
  borderRadius: 10,
  background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.92), rgba(30, 41, 59, 0.84))',
  border: '1px solid rgba(148, 163, 184, 0.26)',
  boxShadow: '0 18px 34px rgba(2, 6, 23, 0.22)',
}

const mapZoomBarFloating: CSSProperties = {
  ...mapZoomBar,
  top: 16,
  left: '50%',
  transform: 'translateX(-50%)',
  zIndex: 7,
  width: 'fit-content',
  justifyContent: 'center',
}

const mapZoomBtn: CSSProperties = {
  minWidth: 32,
  padding: '4px 8px',
  borderRadius: 8,
  border: '1px solid rgba(148, 163, 184, 0.28)',
  background: 'rgba(15, 23, 42, 0.72)',
  color: '#f8fafc',
  cursor: 'pointer',
  fontSize: 16,
  fontWeight: 700,
  lineHeight: 1,
}

const mapZoomHint: CSSProperties = {
  fontSize: 12,
  color: 'rgba(248, 250, 252, 0.75)',
  minWidth: 0,
  textAlign: 'center',
}

const side: CSSProperties = {
  background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.90), rgba(30, 41, 59, 0.78))',
  border: '1px solid rgba(251, 191, 36, 0.22)',
  borderRadius: 22,
  padding: 18,
  backdropFilter: 'blur(12px)',
  boxShadow: '0 28px 60px rgba(2, 6, 23, 0.28)',
  color: '#f8fafc',
}

const btn: CSSProperties = {
  background: 'linear-gradient(180deg, #fb7185 0%, #ef4444 100%)',
  color: '#3b2200',
  border: '1px solid rgba(127, 29, 29, 0.35)',
  padding: '12px 16px',
  borderRadius: 16,
  cursor: 'pointer',
  fontWeight: 900,
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.25), 0 18px 34px rgba(127, 29, 29, 0.18)',
}

const btnAlt: CSSProperties = {
  background: 'linear-gradient(180deg, rgba(148, 163, 184, 0.26) 0%, rgba(71, 85, 105, 0.26) 100%)',
  color: '#f8fafc',
  border: '1px solid rgba(148, 163, 184, 0.24)',
  padding: '12px 16px',
  borderRadius: 16,
  cursor: 'pointer',
  fontWeight: 900,
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.16), 0 18px 34px rgba(2, 6, 23, 0.18)',
}

const btnDisabled: CSSProperties = {
  ...btn,
  opacity: 0.5,
  cursor: 'not-allowed',
}

const tournamentTableScroll: CSSProperties = {
  maxHeight: 320,
  overflowY: 'auto',
  border: '1px solid rgba(148, 163, 184, 0.22)',
  borderRadius: 18,
}

const tournamentTable: CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 14,
}

const th: CSSProperties = {
  textAlign: 'left',
  padding: '10px 12px',
  borderBottom: '1px solid rgba(148, 163, 184, 0.22)',
  background: 'rgba(15, 23, 42, 0.85)',
  position: 'sticky',
  top: 0,
  zIndex: 1,
}

const td: CSSProperties = {
  padding: '10px 12px',
  borderBottom: '1px solid rgba(148, 163, 184, 0.14)',
  verticalAlign: 'top',
}

const rowHighlight: CSSProperties = {
  background: 'rgba(34, 197, 94, 0.14)',
}

const battlefield: CSSProperties = {
  position: 'relative',
  width: '100%',
  marginTop: 12,
  borderRadius: 24,
  overflow: 'hidden',
  border: '1px solid rgba(120, 168, 69, 0.55)',
  background: 'linear-gradient(180deg, #b4df74 0%, #8cc955 36%, #72b13f 100%)',
}

const battlefieldBackdrop: CSSProperties = {
  position: 'absolute',
  inset: 0,
  pointerEvents: 'none',
  zIndex: 0,
  background:
    'radial-gradient(circle at 50% 12%, rgba(255, 255, 255, 0.14), transparent 20%), radial-gradient(circle at 20% 22%, rgba(255, 255, 255, 0.09), transparent 14%), radial-gradient(circle at 82% 26%, rgba(255, 255, 255, 0.08), transparent 12%), repeating-linear-gradient(135deg, rgba(255, 255, 255, 0.03) 0 6px, rgba(0, 0, 0, 0) 6px 18px)',
}

const panelOverlayLeft: CSSProperties = {
  position: 'absolute',
  top: 16,
  left: 16,
  width: 360,
  maxWidth: 'calc(100% - 32px)',
  maxHeight: 'calc(100% - 32px)',
  overflow: 'auto',
  zIndex: 5,
  boxShadow: '0 24px 60px rgba(2, 6, 23, 0.35)',
}

const panelOverlayRight: CSSProperties = {
  position: 'absolute',
  top: 16,
  right: 16,
  width: 360,
  maxWidth: 'calc(100% - 32px)',
  maxHeight: 'calc(100% - 32px)',
  overflow: 'auto',
  zIndex: 5,
  boxShadow: '0 24px 60px rgba(2, 6, 23, 0.35)',
}
