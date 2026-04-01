'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { decodeEventLog, formatEther } from 'viem'
import { useAccount, usePublicClient, useReadContract, useWaitForTransactionReceipt, useWriteContract } from 'wagmi'
import { Navbar } from '@/components/navbar'
import { CITY_ADDRESS, TOKEN_ADDRESS, cityAbi, tokenAbi } from '@/lib/contracts'

type Cell = {
  row: number
  col: number
  buildingId: bigint
}

type BuildingData = {
  id: bigint
  dna: bigint
  level: number
  updateReadyTime: bigint
  isActive: boolean
  shapeMask: number
  buildingType: number
  occupiedCells: Array<{ row: number; col: number }>
  position: { layer: number; row: number; col: number } | null
}

type Decoration = {
  left?: number
  right?: number
  top?: number
  bottom?: number
  width: number
  height: number
  background: string
  borderRadius: string
  transform?: string
  boxShadow?: string
  opacity?: number
}

type BuildingPalette = {
  roof: string
  roofAccent: string
  wall: string
  wallShadow: string
  trim: string
}

type CityStats = {
  level: number
  power: bigint
}

type CityStatsResponse =
  | { level: number | bigint; power: bigint }
  | readonly [number | bigint, bigint]

type PendingAction = 'createCity' | 'putBuilding' | 'moveBuilding' | 'removeBuilding' | 'getMoney' | 'getPower' | 'upgradeLevel'

const CONTRACT_UNAVAILABLE_MESSAGE = 'City contract is not deployed on the current Hardhat RPC. Run make deploy-local and reload the page.'

const GRID_SIZE = 12
const TILE_WIDTH = 96
const TILE_HEIGHT = 52

function isContractUnavailableMessage(message: string) {
  return /requested resource not available|returned no data|could not decode result data/i.test(message)
}

function extractErrorMessage(error: unknown) {
  if (typeof error === 'object' && error !== null) {
    if ('shortMessage' in error && typeof error.shortMessage === 'string') {
      return error.shortMessage
    }

    if ('message' in error && typeof error.message === 'string') {
      return error.message
    }
  }

  return 'Transaction failed. Please try again.'
}

function formatActionError(error: unknown) {
  const rawMessage = extractErrorMessage(error).split('\n')[0]?.trim() ?? 'Transaction failed. Please try again.'
  return isContractUnavailableMessage(rawMessage) ? CONTRACT_UNAVAILABLE_MESSAGE : rawMessage
}

function getBuildingType(dna: bigint) {
  return Number(dna & BigInt(0x1f))
}

function getBuildingShapeMask(dna: bigint) {
  return Number((dna >> BigInt(5)) & BigInt(0x1ff))
}

function hasShapeBit(mask: number, row: number, col: number) {
  const shift = 8 - (row * 3 + col)
  return ((mask >> shift) & 1) === 1
}

function getOccupiedCells(mask: number) {
  const cells: Array<{ row: number; col: number }> = []

  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 3; col += 1) {
      if (hasShapeBit(mask, row, col)) {
        cells.push({ row, col })
      }
    }
  }

  return cells
}

function getBuildingPalette(seed: bigint): BuildingPalette {
  const palettes: BuildingPalette[] = [
    { roof: '#d97706', roofAccent: '#fbbf24', wall: '#fde68a', wallShadow: '#f59e0b', trim: '#7c2d12' },
    { roof: '#b91c1c', roofAccent: '#fb7185', wall: '#fecaca', wallShadow: '#ef4444', trim: '#7f1d1d' },
    { roof: '#2563eb', roofAccent: '#60a5fa', wall: '#bfdbfe', wallShadow: '#1d4ed8', trim: '#172554' },
    { roof: '#7c3aed', roofAccent: '#c4b5fd', wall: '#ddd6fe', wallShadow: '#8b5cf6', trim: '#4c1d95' },
    { roof: '#0f766e', roofAccent: '#2dd4bf', wall: '#ccfbf1', wallShadow: '#14b8a6', trim: '#134e4a' },
    { roof: '#4d7c0f', roofAccent: '#bef264', wall: '#ecfccb', wallShadow: '#84cc16', trim: '#365314' },
  ]

  return palettes[Number(seed % BigInt(palettes.length))]
}

function getBuildingTitle(type: number) {
  const names = ['Mine', 'Barracks', 'Tower']
  return names[type % names.length]
}

function normalizeCityStats(stats: CityStatsResponse): CityStats {
  if (Array.isArray(stats)) {
    return {
      level: Number(stats[0]),
      power: BigInt(stats[1]),
    }
  }

  const namedStats = stats as { level: number | bigint; power: bigint }

  return {
    level: Number(namedStats.level),
    power: BigInt(namedStats.power),
  }
}

function getResourceMarker(buildingType: number) {
  if (buildingType === 0) return { kind: 'money' as const, label: '$', tint: '#f59e0b', glow: 'rgba(245, 158, 11, 0.4)' }
  if (buildingType === 1) return { kind: 'power' as const, label: '✊', tint: '#2563eb', glow: 'rgba(37, 99, 235, 0.45)' }
  return null
}

function formatCooldown(secondsLeft: number) {
  if (secondsLeft <= 0) return 'Ready'

  const hours = Math.floor(secondsLeft / 3600)
  const minutes = Math.floor((secondsLeft % 3600) / 60)
  const seconds = secondsLeft % 60

  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}m`
  if (minutes > 0) return `${minutes}m ${String(seconds).padStart(2, '0')}s`
  return `${seconds}s`
}

function renderPlacedBuilding(building: BuildingData, selected: boolean, currentTimeSec: number) {
  const palette = getBuildingPalette(building.id)
  const level = Number(building.id % BigInt(3))
  const wallHeight = 18 + level * 4
  const topHeight = TILE_HEIGHT
  const frontTipY = topHeight + wallHeight
  const occupied = new Set(building.occupiedCells.map((cell) => `${cell.row}:${cell.col}`))
  const offsets = building.occupiedCells
    .map((cell) => ({
      row: cell.row,
      col: cell.col,
      left: (cell.col - cell.row) * (TILE_WIDTH / 2),
      top: (cell.col + cell.row) * (TILE_HEIGHT / 2),
      depth: cell.row + cell.col,
    }))
    .sort((a, b) => (a.depth - b.depth) || (a.left - b.left))

  const minLeft = Math.min(...offsets.map((offset) => offset.left))
  const maxLeft = Math.max(...offsets.map((offset) => offset.left))
  const maxTop = Math.max(...offsets.map((offset) => offset.top))
  const width = maxLeft - minLeft + TILE_WIDTH
  const height = maxTop + frontTipY
  const resourceMarker = getResourceMarker(building.buildingType)
  const readyAt = Number(building.updateReadyTime)
  const ready = currentTimeSec >= readyAt
  const cooldownText = formatCooldown(Math.max(0, readyAt - currentTimeSec))

  return (
    <div
      style={{
        position: 'absolute',
        left: minLeft,
        top: -wallHeight + 4,
        width,
        height,
        filter: selected ? 'drop-shadow(0 10px 20px rgba(245, 158, 11, 0.35))' : 'drop-shadow(0 8px 14px rgba(15, 23, 42, 0.35))',
        pointerEvents: 'none',
        zIndex: 4,
      }}
    >
      {resourceMarker && (
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: 15,
            transform: 'translateX(-50%)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 10,
            pointerEvents: 'none',
            zIndex: 6,
          }}
        >
          <div
            style={{
              ...resourceMarkerDot,
              color: resourceMarker.tint,
              boxShadow: ready ? `0 0 0 3px ${resourceMarker.glow}, 0 10px 18px rgba(15, 23, 42, 0.28)` : '0 10px 18px rgba(15, 23, 42, 0.22)',
              borderColor: ready ? resourceMarker.tint : 'rgba(148, 163, 184, 0.5)',
            }}
          >
            {resourceMarker.label}
          </div>
          {!ready && <div style={resourceCooldownPill}>{cooldownText}</div>}
        </div>
      )}

      {offsets.map((offset, index) => (
        <div
          key={index}
          style={{
            position: 'absolute',
            left: offset.left - minLeft,
            top: offset.top,
            width: TILE_WIDTH,
            height: frontTipY,
          }}
        >
          {(() => {
            const showLeftFace = !occupied.has(`${offset.row + 1}:${offset.col}`)
            const showRightFace = !occupied.has(`${offset.row}:${offset.col + 1}`)

            return (
              <>
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: 0,
              height: topHeight,
              clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)',
              background: `linear-gradient(180deg, ${palette.roofAccent} 0%, ${palette.roof} 100%)`,
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.22)',
            }}
          />
                {showLeftFace && (
                  <div
                    style={{
                      position: 'absolute',
                      left: 0,
                      top: topHeight / 2 - 6,
                      width: TILE_WIDTH / 2,
                      height: topHeight / 2 + wallHeight,
                      clipPath: 'polygon(0% 0%, 100% 50%, 100% 100%, 0% 64%)',
                      background: `linear-gradient(180deg, ${palette.wall} 0%, ${palette.wallShadow} 100%)`,
                      boxShadow: 'inset 3px 0 0 rgba(255,255,255,0.1), inset 0 -4px 0 rgba(0,0,0,0.08)',
                    }}
                  />
                )}
                {showRightFace && (
                  <div
                    style={{
                      position: 'absolute',
                      right: 0,
                      top: topHeight / 2 - 6,
                      width: TILE_WIDTH / 2,
                      height: topHeight / 2 + wallHeight,
                      clipPath: 'polygon(0% 50%, 100% 0%, 100% 64%, 0% 100%)',
                      background: `linear-gradient(180deg, ${palette.wallShadow} 0%, ${palette.trim} 100%)`,
                      boxShadow: 'inset -3px 0 0 rgba(0,0,0,0.12), inset 0 -4px 0 rgba(0,0,0,0.1)',
                    }}
                  />
                )}
                {showLeftFace && (
                  <div
                    style={{
                      position: 'absolute',
                      left: 12,
                      top: topHeight / 2 + 8,
                      width: 6,
                      height: 10,
                      borderRadius: 2,
                      background: 'rgba(255, 248, 220, 0.88)',
                    }}
                  />
                )}
                {showRightFace && (
                  <div
                    style={{
                      position: 'absolute',
                      right: 14,
                      top: topHeight / 2 + 9,
                      width: 6,
                      height: 9,
                      borderRadius: 2,
                      background: 'rgba(255, 248, 220, 0.72)',
                    }}
                  />
                )}
              </>
            )
          })()}
        </div>
      ))}
    </div>
  )
}

const boardDecorations: Decoration[] = [
  {
    left: 18,
    top: 28,
    width: 98,
    height: 68,
    background: 'radial-gradient(circle at 30% 35%, #d9f99d 0%, #84cc16 58%, #4d7c0f 100%)',
    borderRadius: '54% 46% 48% 52% / 43% 47% 53% 57%',
    boxShadow: 'inset 0 4px 0 rgba(255,255,255,0.2), 0 12px 20px rgba(77, 124, 15, 0.22)',
    opacity: 0.9,
  },
  {
    right: 26,
    top: 42,
    width: 88,
    height: 58,
    background: 'radial-gradient(circle at 30% 35%, #fef3c7 0%, #d6d3d1 46%, #78716c 100%)',
    borderRadius: '50% 50% 44% 56% / 44% 56% 44% 56%',
    transform: 'rotate(-10deg)',
    boxShadow: 'inset 0 3px 0 rgba(255,255,255,0.22), 0 10px 18px rgba(68, 64, 60, 0.18)',
  },
  {
    left: 40,
    bottom: 38,
    width: 86,
    height: 54,
    background: 'radial-gradient(circle at 40% 40%, #bbf7d0 0%, #65a30d 56%, #3f6212 100%)',
    borderRadius: '59% 41% 50% 50% / 48% 53% 47% 52%',
    boxShadow: 'inset 0 3px 0 rgba(255,255,255,0.18), 0 10px 18px rgba(63, 98, 18, 0.18)',
    opacity: 0.92,
  },
  {
    right: 34,
    bottom: 26,
    width: 112,
    height: 72,
    background: 'radial-gradient(circle at 50% 35%, #e7e5e4 0%, #a8a29e 52%, #57534e 100%)',
    borderRadius: '48% 52% 45% 55% / 46% 40% 60% 54%',
    transform: 'rotate(14deg)',
    boxShadow: 'inset 0 4px 0 rgba(255,255,255,0.2), 0 12px 20px rgba(87, 83, 78, 0.18)',
    opacity: 0.82,
  },
]

export default function Page() {
  const { address, isConnected } = useAccount()
  const publicClient = usePublicClient()
  const { writeContractAsync } = useWriteContract()

  const [grid, setGrid] = useState<Cell[][]>([])
  const [loadingGrid, setLoadingGrid] = useState(false)
  const [selectedLayer, setSelectedLayer] = useState('0')
  const [selectedCell, setSelectedCell] = useState<{ row: number; col: number } | null>(null)
  const [hash, setHash] = useState<`0x${string}` | undefined>()
  const [buildings, setBuildings] = useState<BuildingData[]>([])
  const [inventoryOpen, setInventoryOpen] = useState(false)
  const [deleteMode, setDeleteMode] = useState(false)
  const [draggingBuildingId, setDraggingBuildingId] = useState<string | null>(null)
  const [hoverCell, setHoverCell] = useState<{ row: number; col: number } | null>(null)
  const [canDropHere, setCanDropHere] = useState<boolean | null>(null)
  const [cityStats, setCityStats] = useState<CityStats | null>(null)
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null)
  const [currentTimeSec, setCurrentTimeSec] = useState(() => Math.floor(Date.now() / 1000))
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [cityContractReady, setCityContractReady] = useState<boolean | null>(null)
  const selectedLayerIndex = Number(selectedLayer)
  const availableLayerCount = Math.max((cityStats?.level ?? 0) + 1, 1)

  const { data: cityId, refetch: refetchCityId } = useReadContract({
    address: CITY_ADDRESS,
    abi: cityAbi,
    functionName: 'ownerToCity',
    args: address ? [address] : undefined,
    query: { enabled: !!address && cityContractReady === true },
  })

  const { data: tokenBalance, refetch: refetchBalance } = useReadContract({
    address: TOKEN_ADDRESS,
    abi: tokenAbi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address && cityContractReady === true },
  })

  const { data: cityStatsData, refetch: refetchCityStats } = useReadContract({
    address: CITY_ADDRESS,
    abi: cityAbi,
    functionName: 'getCityStats',
    args: address ? [address] : undefined,
    query: { enabled: !!address && cityContractReady === true && !!cityId && cityId !== BigInt(0) },
  })

  const { data: upgradeLevelPriceData, refetch: refetchUpgradeLevelPrice } = useReadContract({
    address: CITY_ADDRESS,
    abi: cityAbi,
    functionName: 'getUpgradeLevelPrice',
    args: [],
    account: address,
    query: { enabled: !!address && cityContractReady === true && !!cityId && cityId !== BigInt(0) },
  })

  const { data: txReceipt, isLoading: txPending } = useWaitForTransactionReceipt({
    hash,
    query: { enabled: !!hash },
  })

  useEffect(() => {
    let cancelled = false

    async function checkCityContract() {
      if (!publicClient) {
        setCityContractReady(null)
        return
      }

      try {
        const code = await publicClient.getCode({ address: CITY_ADDRESS })

        if (cancelled) return

        const ready = !!code && code !== '0x'
        setCityContractReady(ready)

        if (ready) {
          setActionError((current) => (current === CONTRACT_UNAVAILABLE_MESSAGE ? null : current))
        }
      } catch {
        if (!cancelled) {
          setCityContractReady(null)
        }
      }
    }

    void checkCityContract()

    return () => {
      cancelled = true
    }
  }, [publicClient])

  const refreshBuildings = useCallback(async () => {
    if (!publicClient || !address || cityContractReady !== true) {
      setBuildings([])
      return
    }

    const ids: bigint[] = []

    for (let i = 0; i < 100; i += 1) {
      try {
        const id = (await publicClient.readContract({
          address: CITY_ADDRESS,
          abi: cityAbi,
          functionName: 'ownerToBuildingIds',
          args: [address, BigInt(i)],
        })) as bigint

        ids.push(id)
      } catch {
        break
      }
    }

    const ownedIds = ids.filter((id) => id !== BigInt(0))
    const buildingStructs = (await publicClient.readContract({
      address: CITY_ADDRESS,
      abi: cityAbi,
      functionName: 'getBuildingsByOwner',
      args: [address, false],
    })) as Array<{
      dna: bigint
      level: number
      updateReadyTime: bigint
      isActive: boolean
    }>

    const mappedBuildings = await Promise.all(
      buildingStructs
        .map(async (building, index) => {
          const shapeMask = getBuildingShapeMask(building.dna)
          const id = ownedIds[index]

          if (!id) return null

          let position: BuildingData['position'] = null

          if (building.isActive) {
            const rawPosition = (await publicClient.readContract({
              address: CITY_ADDRESS,
              abi: cityAbi,
              functionName: 'buildingPosition',
              args: [id],
            })) as
              | { layer: number | bigint; top: number | bigint; left: number | bigint }
              | readonly [number | bigint, number | bigint, number | bigint]

            const namedPosition = rawPosition as { layer: number | bigint; top: number | bigint; left: number | bigint }
            const layer = Array.isArray(rawPosition) ? rawPosition[0] : namedPosition.layer
            const top = Array.isArray(rawPosition) ? rawPosition[1] : namedPosition.top
            const left = Array.isArray(rawPosition) ? rawPosition[2] : namedPosition.left

            position = {
              layer: Number(layer),
              row: Number(top),
              col: Number(left),
            }
          }

          return {
            id,
            dna: building.dna,
            level: Number(building.level),
            updateReadyTime: building.updateReadyTime,
            isActive: building.isActive,
            shapeMask,
            buildingType: getBuildingType(building.dna),
            occupiedCells: getOccupiedCells(shapeMask),
            position,
          } satisfies BuildingData
        }),
    )

    setBuildings(mappedBuildings.filter((building): building is BuildingData => building !== null))
  }, [address, cityContractReady, publicClient])

  const loadGrid = useCallback(async () => {
    if (!publicClient || !address || cityContractReady !== true || !cityId || cityId === BigInt(0)) {
      setGrid([])
      return
    }

    setLoadingGrid(true)

    try {
      const layer = Number(selectedLayer)
      const rows = await Promise.all(
        Array.from({ length: GRID_SIZE }, async (_, row) => {
          const cols = await Promise.all(
            Array.from({ length: GRID_SIZE }, async (_, col) => {
              const buildingId = (await publicClient.readContract({
                address: CITY_ADDRESS,
                abi: cityAbi,
                functionName: 'getCell',
                args: [address, layer, row, col],
              })) as bigint

              return { row, col, buildingId }
            }),
          )

          return cols
        }),
      )

      setGrid(rows)
    } finally {
      setLoadingGrid(false)
    }
  }, [address, cityContractReady, cityId, publicClient, selectedLayer])

  useEffect(() => {
    loadGrid()
    refreshBuildings()
  }, [loadGrid, refreshBuildings])

  useEffect(() => {
    if (!cityId || cityId === BigInt(0)) {
      setCityStats(null)
      return
    }

    if (cityStatsData) {
      setCityStats(normalizeCityStats(cityStatsData as CityStatsResponse))
    }
  }, [cityId, cityStatsData])

  useEffect(() => {
    const nextLayer = Math.min(Math.max(selectedLayerIndex, 0), availableLayerCount - 1)
    if (nextLayer !== selectedLayerIndex) {
      setSelectedLayer(String(nextLayer))
    }
  }, [availableLayerCount, selectedLayerIndex])

  useEffect(() => {
    if (!txReceipt || !pendingAction) return

    let powerGained = 0n
    let shouldRefetchStats = pendingAction === 'upgradeLevel' || pendingAction === 'createCity'
    let shouldRefreshBuildings = pendingAction === 'getMoney' || pendingAction === 'getPower'
    let shouldRefetchUpgradePrice = pendingAction === 'upgradeLevel' || pendingAction === 'createCity'

    for (const log of txReceipt.logs) {
      try {
        const decoded = decodeEventLog({
          abi: cityAbi,
          data: log.data,
          topics: log.topics,
        })

        if (decoded.eventName === 'PowerGained') {
          powerGained += (decoded.args.power as bigint | undefined) ?? 0n
          shouldRefetchStats = true
          shouldRefreshBuildings = true
        }

        if (decoded.eventName === 'FieldChanged') {
          shouldRefetchStats = true
        }

        if (decoded.eventName === 'LevelUpgraded') {
          shouldRefetchUpgradePrice = true
        }
      } catch {
        continue
      }
    }

    if (powerGained > 0n) {
      setCityStats((current) => (current ? { ...current, power: current.power + powerGained } : current))
    }

    if (shouldRefetchStats) {
      void refetchCityStats()
    }

    if (shouldRefreshBuildings) {
      void refreshBuildings()
    }

    if (shouldRefetchUpgradePrice) {
      void refetchUpgradeLevelPrice()
    }

    setPendingAction(null)
  }, [pendingAction, refetchCityStats, refetchUpgradeLevelPrice, refreshBuildings, txReceipt])

  useEffect(() => {
    const interval = window.setInterval(() => {
      setCurrentTimeSec(Math.floor(Date.now() / 1000))
    }, 1000)

    return () => window.clearInterval(interval)
  }, [])

  async function sendContractTransaction(
    action: PendingAction,
    write: () => Promise<`0x${string}`>,
    onSubmitted?: () => void,
  ) {
    setActionError(null)

    try {
      const tx = await write()
      setPendingAction(action)
      setHash(tx)
      onSubmitted?.()
    } catch (error) {
      const message = formatActionError(error)
      setActionError(message)

      if (message === CONTRACT_UNAVAILABLE_MESSAGE) {
        setCityContractReady(false)
      }
    }
  }

  async function createCity() {
    await sendContractTransaction(
      'createCity',
      () =>
        writeContractAsync({
          address: CITY_ADDRESS,
          abi: cityAbi,
          functionName: 'createCity',
          args: [],
        }),
      () => {
        setTimeout(() => {
          void refetchCityId()
          void refetchCityStats()
          void loadGrid()
          void refreshBuildings()
        }, 1500)
      },
    )
  }

  async function placeBuilding(buildingId: bigint, row: number, col: number) {
    await sendContractTransaction(
      'putBuilding',
      () =>
        writeContractAsync({
          address: CITY_ADDRESS,
          abi: cityAbi,
          functionName: 'putBuilding',
          args: [Number(selectedLayer), row, col, buildingId],
        }),
      () => {
        setTimeout(() => {
          void loadGrid()
          void refreshBuildings()
        }, 1500)
      },
    )
  }

  async function relocateBuilding(buildingId: bigint, row: number, col: number) {
    await sendContractTransaction(
      'moveBuilding',
      () =>
        writeContractAsync({
          address: CITY_ADDRESS,
          abi: cityAbi,
          functionName: 'moveBuilding',
          args: [Number(selectedLayer), row, col, buildingId],
        }),
      () => {
        setTimeout(() => {
          void loadGrid()
          void refreshBuildings()
        }, 1500)
      },
    )
  }

  async function removeBuilding(buildingId: bigint) {
    await sendContractTransaction(
      'removeBuilding',
      () =>
        writeContractAsync({
          address: CITY_ADDRESS,
          abi: cityAbi,
          functionName: 'removeBuilding',
          args: [buildingId],
        }),
      () => {
        setTimeout(() => {
          void loadGrid()
          void refreshBuildings()
        }, 1500)
      },
    )
  }

  async function collectMoney() {
    await sendContractTransaction(
      'getMoney',
      () =>
        writeContractAsync({
          address: CITY_ADDRESS,
          abi: cityAbi,
          functionName: 'getMoney',
          args: [],
        }),
      () => {
        setTimeout(() => {
          void refetchBalance()
        }, 1500)
      },
    )
  }

  async function collectPower() {
    await sendContractTransaction('getPower', () =>
      writeContractAsync({
        address: CITY_ADDRESS,
        abi: cityAbi,
        functionName: 'getPower',
        args: [],
      }),
    )
  }

  async function upgradeLevel() {
    if (upgradeLevelPriceData === undefined) return

    await sendContractTransaction(
      'upgradeLevel',
      () =>
        writeContractAsync({
          address: CITY_ADDRESS,
          abi: cityAbi,
          functionName: 'upgradeLevel',
          args: [],
          value: BigInt(upgradeLevelPriceData),
        }),
      () => {
        setUpgradeModalOpen(false)
      },
    )
  }

  const inventoryBuildings = useMemo(() => buildings.filter((building) => !building.isActive), [buildings])
  const activeBuildings = useMemo(
    () => buildings.filter((building) => building.isActive && building.position?.layer === Number(selectedLayer)),
    [buildings, selectedLayer],
  )
  const computedDefense = useMemo(
    () =>
      buildings.reduce((sum, building) => {
        if (!building.isActive || building.buildingType !== 2) return sum
        return sum + BigInt((building.level) * 100)
      }, 0n),
    [buildings],
  )

  const draggingBuilding = useMemo(
    () => buildings.find((building) => building.id.toString() === draggingBuildingId) ?? null,
    [buildings, draggingBuildingId],
  )

  const previewCells = useMemo(() => {
    if (!draggingBuilding || !hoverCell) return []

    return draggingBuilding.occupiedCells.map((cell) => ({
      row: hoverCell.row + cell.row,
      col: hoverCell.col + cell.col,
    }))
  }, [draggingBuilding, hoverCell])

  const localCanPlace = useCallback(
    (building: BuildingData, top: number, left: number) => {
      for (const occupiedCell of building.occupiedCells) {
        const row = top + occupiedCell.row
        const col = left + occupiedCell.col

        if (row < 0 || col < 0 || row >= GRID_SIZE || col >= GRID_SIZE) {
          return false
        }

        const occupant = grid[row]?.[col]?.buildingId ?? BigInt(0)
        if (occupant !== BigInt(0) && occupant !== building.id) {
          return false
        }
      }

      return true
    },
    [grid],
  )

  useEffect(() => {
    if (!draggingBuilding || !hoverCell) {
      setCanDropHere(null)
      return
    }

    setCanDropHere(localCanPlace(draggingBuilding, hoverCell.row, hoverCell.col))
  }, [draggingBuilding, hoverCell, localCanPlace])

  function resetDragState() {
    setDraggingBuildingId(null)
    setHoverCell(null)
    setCanDropHere(null)
  }

  function toggleInventory() {
    setInventoryOpen((open) => {
      const next = !open
      if (!next) {
        setDeleteMode(false)
        resetDragState()
      }
      return next
    })
  }

  async function handleDrop(row: number, col: number) {
    if (!draggingBuilding || canDropHere !== true || txPending) return

    if (draggingBuilding.isActive) {
      await relocateBuilding(draggingBuilding.id, row, col)
    } else {
      await placeBuilding(draggingBuilding.id, row, col)
      setInventoryOpen(false)
    }

    resetDragState()
  }

  async function handleTileClick(cell: Cell) {
    setSelectedCell({ row: cell.row, col: cell.col })

    if (!deleteMode || cell.buildingId === BigInt(0) || txPending) {
      return
    }

    await removeBuilding(cell.buildingId)
    setDeleteMode(false)
    setInventoryOpen(false)
  }

  return (
    <main
      style={{
        display: 'grid',
        gridTemplateRows: 'auto 1fr',
        gap: 16,
        height: '100vh',
        padding: '10px 24px 16px',
        overflow: 'hidden',
        boxSizing: 'border-box',
      }}
    >
      <div>
        <Navbar />
      </div>

      {!isConnected && (
        <div style={{ padding: 16, border: '1px solid #334155', borderRadius: 12, background: '#111827' }}>
          Connect wallet to create a city and manage your buildings.
        </div>
      )}

      {isConnected && (
        <div style={mapLayout}>
          <section style={{ width: '100%', height: '100%', minHeight: 0 }}>
            <div style={cityBoardShell}>
              <div style={cityBoardBackdrop} />
              <div style={mapHud}>
                <div style={mapHudTopRow}>
                  <div style={hudChip}>City Lv. {(cityStats?.level ?? 0) + 1} · Power {cityStats?.power.toString() ?? '0'} · Def {computedDefense.toString()}</div>
                  <div style={hudChip}>Balance: {tokenBalance ? formatEther(tokenBalance) : '0'}</div>
                  {!!cityId && cityId !== BigInt(0) && (
                    <>
                    <button onClick={collectMoney} disabled={txPending} style={actionPrimaryButton}>
                      Get Money
                    </button>
                    <button onClick={collectPower} disabled={txPending} style={actionSecondaryButton}>
                      Get Power
                    </button>
                    <button
                      onClick={() => {
                        void refetchUpgradeLevelPrice()
                        setUpgradeModalOpen(true)
                      }}
                      disabled={txPending}
                      style={actionGoldButton}
                    >
                      Upgrade
                    </button>
                    </>
                  )}
                </div>
              </div>

              <button
                onClick={() => setSelectedLayer(String(selectedLayerIndex - 1))}
                disabled={selectedLayerIndex <= 0}
                style={{
                  ...layerEdgeButton,
                  left: 18,
                  opacity: selectedLayerIndex <= 0 ? 0.38 : 1,
                  cursor: selectedLayerIndex <= 0 ? 'not-allowed' : 'pointer',
                }}
                aria-label="Previous layer"
              >
                <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
                  <path d="M14.5 5.5 8 12l6.5 6.5" fill="none" stroke="#ffffff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>

              <button
                onClick={() => setSelectedLayer(String(selectedLayerIndex + 1))}
                disabled={selectedLayerIndex >= availableLayerCount - 1}
                style={{
                  ...layerEdgeButton,
                  right: 18,
                  opacity: selectedLayerIndex >= availableLayerCount - 1 ? 0.38 : 1,
                  cursor: selectedLayerIndex >= availableLayerCount - 1 ? 'not-allowed' : 'pointer',
                }}
                aria-label="Next layer"
              >
                <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
                  <path d="M9.5 5.5 16 12l-6.5 6.5" fill="none" stroke="#ffffff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>

              <div style={layerCornerLabel}>Layer {selectedLayerIndex + 1}</div>

              {upgradeModalOpen && (
                <div style={upgradeModalOverlay}>
                  <div style={upgradeModalCard}>
                    <div style={{ fontSize: 12, letterSpacing: 0.8, textTransform: 'uppercase', opacity: 0.7 }}>
                      City Upgrade
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 900 }}>
                      Lvl {(cityStats?.level ?? 0) + 1} → Lvl {(cityStats?.level ?? 0) + 2}
                    </div>
                    <div style={{ fontSize: 15, color: '#cbd5e1' }}>
                      Price: {upgradeLevelPriceData !== undefined ? `${formatEther(BigInt(upgradeLevelPriceData))} ETH` : 'Loading...'}
                    </div>
                    <div style={upgradeModalActions}>
                      <button
                        onClick={() => setUpgradeModalOpen(false)}
                        style={upgradeCancelButton}
                        disabled={txPending}
                      >
                        Cancel
                      </button>
                      <button
                        onClick={upgradeLevel}
                        disabled={txPending || upgradeLevelPriceData === undefined}
                        style={upgradeConfirmButton}
                      >
                        Confirm Upgrade
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {(!cityId || cityId === BigInt(0)) && (
                <div style={createCityOverlay}>
                  <div style={createCityCard}>
                    <div style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: 1, opacity: 0.72 }}>Fresh territory</div>
                    <div style={{ fontSize: 36, fontWeight: 900, lineHeight: 1.05 }}>Create your city</div>
                    <div style={{ maxWidth: 420, fontSize: 15, opacity: 0.82 }}>
                      {cityContractReady === false
                        ? 'The local Hardhat RPC is running, but the city contract is not deployed yet. Run make deploy-local, then reload this page.'
                        : cityContractReady === null
                          ? 'Checking whether the city contract is available on the connected RPC...'
                          : 'Found your city first. After that you can open inventory and place buildings directly on the map.'}
                    </div>
                    <button onClick={createCity} disabled={txPending || cityContractReady !== true} style={createCityButton}>
                      {cityContractReady === false ? 'Contract Missing' : cityContractReady === null ? 'Checking...' : 'Create City'}
                    </button>
                  </div>
                </div>
              )}

              {boardDecorations.map((decoration, index) => (
                <div
                  key={index}
                  style={{
                    position: 'absolute',
                    pointerEvents: 'none',
                    zIndex: 0,
                    left: decoration.left,
                    right: decoration.right,
                    top: decoration.top,
                    bottom: decoration.bottom,
                    width: decoration.width,
                    height: decoration.height,
                    background: decoration.background,
                    borderRadius: decoration.borderRadius,
                    transform: decoration.transform,
                    boxShadow: decoration.boxShadow,
                    opacity: decoration.opacity ?? 1,
                  }}
                />
              ))}

              <div style={cityBoard}>
                {grid.flat().map((cell) => {
                  const selected = selectedCell?.row === cell.row && selectedCell?.col === cell.col
                  const previewState = previewCells.some((previewCell) => previewCell.row === cell.row && previewCell.col === cell.col)
                  const cellBuilding = cell.buildingId === BigInt(0) ? null : activeBuildings.find((building) => building.id === cell.buildingId) ?? null

                  return (
                    <button
                      key={`${cell.row}-${cell.col}`}
                      onClick={() => handleTileClick(cell)}
                      draggable={!!cellBuilding && !deleteMode}
                      onDragStart={() => {
                        if (!cellBuilding || deleteMode) return
                        setDraggingBuildingId(cellBuilding.id.toString())
                      }}
                      onDragEnd={resetDragState}
                      onDragOver={(event) => {
                        event.preventDefault()
                        if (!draggingBuildingId || deleteMode) return
                        setHoverCell({ row: cell.row, col: cell.col })
                      }}
                      onDrop={async (event) => {
                        event.preventDefault()
                        if (deleteMode) return
                        await handleDrop(cell.row, cell.col)
                      }}
                      style={{
                        ...tileButton,
                        left: (cell.col - cell.row + GRID_SIZE - 1) * (TILE_WIDTH / 2),
                        top: (cell.col + cell.row) * (TILE_HEIGHT / 2),
                        filter: deleteMode && cell.buildingId !== BigInt(0)
                          ? 'drop-shadow(0 8px 12px rgba(239, 68, 68, 0.24))'
                          : selected
                            ? 'drop-shadow(0 6px 10px rgba(245, 158, 11, 0.28))'
                            : 'none',
                        transform: selected ? 'scale(1.04)' : 'scale(1)',
                      }}
                      title={cell.buildingId === BigInt(0) ? 'Empty tile' : `Building #${cell.buildingId.toString()}`}
                    >
                      <div style={tileGround} />
                      <div style={tileGrassTexture} />
                      <div style={tileGrassHighlight} />
                      {previewState && (
                        <div
                          style={{
                            ...previewOverlay,
                            background: canDropHere === false ? 'rgba(239, 68, 68, 0.42)' : 'rgba(34, 197, 94, 0.3)',
                            boxShadow: canDropHere === false ? 'inset 0 0 0 1px rgba(127, 29, 29, 0.35)' : 'inset 0 0 0 1px rgba(20, 83, 45, 0.25)',
                          }}
                        />
                      )}
                      <div style={tileShade} />
                      {cell.buildingId === BigInt(0) && (
                        <>
                          <div style={emptyPatchStyle} />
                          <div style={emptyStoneStyle} />
                        </>
                      )}
                    </button>
                  )
                })}

                {activeBuildings.map((building) => {
                  if (!building.position) return null

                  const selected = selectedCell?.row === building.position.row && selectedCell?.col === building.position.col
                  return (
                    <div
                      key={`overlay-${building.id.toString()}`}
                      style={{
                        position: 'absolute',
                        left: (building.position.col - building.position.row + GRID_SIZE - 1) * (TILE_WIDTH / 2),
                        top: (building.position.col + building.position.row) * (TILE_HEIGHT / 2),
                        width: TILE_WIDTH,
                        height: TILE_HEIGHT,
                        pointerEvents: 'none',
                        overflow: 'visible',
                      }}
                    >
                      {renderPlacedBuilding(building, selected, currentTimeSec)}
                    </div>
                  )
                })}
              </div>
            </div>

            {hash && <div style={mapFooterNote}>tx: {hash}</div>}
            {actionError && <div style={errorBanner}>{actionError}</div>}

            {draggingBuilding && (
              <div style={{ marginTop: 12, fontSize: 13, color: canDropHere === false ? '#fecaca' : '#e5e7eb' }}>
                Dragging #{draggingBuilding.id.toString()}.
                {canDropHere === null && ' Hover a tile to preview the shape.'}
                {canDropHere === true && ' Release to place the building.'}
                {canDropHere === false && ' This position is invalid for the current shape.'}
              </div>
            )}

            {loadingGrid && <div style={{ marginTop: 12 }}>Loading field...</div>}
          </section>

          <button
            onClick={toggleInventory}
            style={{
              ...inventoryToggle,
              right: inventoryOpen ? 356 : 0,
            }}
            aria-label={inventoryOpen ? 'Close inventory' : 'Open inventory'}
          >
            {inventoryOpen ? '>' : '<'}
          </button>

          <aside
            style={{
              ...inventoryDrawer,
              transform: inventoryOpen ? 'translateX(0)' : 'translateX(calc(100% + 28px))',
              opacity: inventoryOpen ? 1 : 0,
              visibility: inventoryOpen ? 'visible' : 'hidden',
              pointerEvents: inventoryOpen ? 'auto' : 'none',
            }}
          >
            <div style={inventoryDrawerHeader}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 18 }}>Inventory</div>
                <div style={{ fontSize: 13, opacity: 0.72 }}>
                  Drag a building onto the field or switch to delete mode.
                </div>
              </div>
            </div>

            <div style={inventoryActions}>
              <button
                onClick={() => {
                  setDeleteMode((value) => !value)
                  resetDragState()
                }}
                style={deleteMode ? deleteButtonActive : deleteButton}
              >
                Delete
              </button>
              {deleteMode && (
                <div style={deleteHint}>
                  Click a placed building on the field to remove it.
                </div>
              )}
            </div>

            {inventoryBuildings.length === 0 && (
              <div style={emptyInventory}>
                No unplaced buildings in inventory yet.
              </div>
            )}

            <div style={{ display: 'grid', gap: 12 }}>
              {inventoryBuildings.map((building) => (
                <div
                  key={building.id.toString()}
                  draggable={!deleteMode}
                  onDragStart={() => {
                    if (deleteMode) return
                    setDraggingBuildingId(building.id.toString())
                  }}
                  onDragEnd={resetDragState}
                  style={{
                    ...inventoryCard,
                    opacity: deleteMode ? 0.55 : 1,
                    borderColor: draggingBuildingId === building.id.toString() ? '#f59e0b' : '#334155',
                    cursor: deleteMode ? 'not-allowed' : 'grab',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                    <div>
                      <div style={{ fontWeight: 800 }}>{getBuildingTitle(building.buildingType)}</div>
                      <div style={{ fontSize: 12, opacity: 0.72 }}>
                        #{building.id.toString()} · lvl {building.level}
                      </div>
                    </div>
                    <div style={dragBadge}>{deleteMode ? 'locked' : 'drag'}</div>
                  </div>

                  <div style={shapeGrid}>
                    {Array.from({ length: 9 }, (_, index) => {
                      const row = Math.floor(index / 3)
                      const col = index % 3
                      return <div key={index} style={hasShapeBit(building.shapeMask, row, col) ? shapeCellFilled : shapeCellEmpty} />
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 6, fontWeight: 800, fontSize: 14 }}>Placed buildings</div>
            <div style={{ fontSize: 13, opacity: 0.72 }}>
              Drag a building directly on the field to move it.
            </div>
            <div style={{ display: 'grid', gap: 10 }}>
              {activeBuildings.map((building) => (
                <div key={building.id.toString()} style={{ ...inventoryCard, cursor: 'default', opacity: 0.82 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                    <div>
                      <div style={{ fontWeight: 800 }}>{getBuildingTitle(building.buildingType)}</div>
                      <div style={{ fontSize: 12, opacity: 0.72 }}>
                        #{building.id.toString()} · lvl {building.level}
                      </div>
                    </div>
                    <div style={dragBadge}>placed</div>
                  </div>
                </div>
              ))}
            </div>
          </aside>
        </div>
      )}
    </main>
  )
}

const mapLayout: React.CSSProperties = {
  position: 'relative',
  width: '100%',
  maxWidth: '100%',
  minWidth: 0,
  height: '100%',
}

const mapHud: React.CSSProperties = {
  position: 'absolute',
  top: 22,
  left: 24,
  zIndex: 6,
  display: 'flex',
  justifyContent: 'flex-start',
  width: 'max-content',
  maxWidth: 'calc(100% - 180px)',
  pointerEvents: 'none',
}

const mapHudTopRow: React.CSSProperties = {
  display: 'flex',
  gap: 10,
  flexWrap: 'nowrap',
  alignItems: 'stretch',
  pointerEvents: 'auto',
}

const hudChip: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  minHeight: 48,
  padding: '0 16px',
  borderRadius: 16,
  border: '1px solid rgba(52, 211, 153, 0.2)',
  background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.92), rgba(30, 41, 59, 0.86))',
  color: '#f8fafc',
  fontSize: 13,
  fontWeight: 700,
  boxShadow: '0 14px 28px rgba(15, 23, 42, 0.18)',
}

const layerCornerLabel: React.CSSProperties = {
  position: 'absolute',
  right: 26,
  bottom: 18,
  zIndex: 6,
  color: '#ffffff',
  fontSize: 22,
  fontWeight: 800,
  letterSpacing: 0.4,
  textShadow: '0 2px 6px rgba(0,0,0,0.35)',
  pointerEvents: 'none',
}

const layerEdgeButton: React.CSSProperties = {
  position: 'absolute',
  top: '50%',
  zIndex: 6,
  width: 68,
  height: 68,
  transform: 'translateY(-50%)',
  borderRadius: 999,
  border: '2px solid rgba(95, 140, 49, 0.95)',
  background: '#82c341',
  color: '#ffffff',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 0,
  cursor: 'pointer',
  boxShadow: '0 14px 24px rgba(67, 110, 31, 0.22)',
}

const createCityOverlay: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  zIndex: 7,
  display: 'grid',
  placeItems: 'center',
  padding: 24,
  background: 'radial-gradient(circle at 50% 44%, rgba(255, 255, 255, 0.08), rgba(15, 23, 42, 0.14) 36%, rgba(15, 23, 42, 0.22) 100%)',
}

const createCityCard: React.CSSProperties = {
  display: 'grid',
  justifyItems: 'center',
  gap: 14,
  width: 'min(100%, 540px)',
  padding: '28px 30px',
  borderRadius: 28,
  border: '1px solid rgba(245, 158, 11, 0.35)',
  background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.9), rgba(30, 41, 59, 0.82))',
  boxShadow: '0 28px 60px rgba(15, 23, 42, 0.28)',
  color: '#f8fafc',
  textAlign: 'center',
}

const createCityButton: React.CSSProperties = {
  background: 'linear-gradient(180deg, #fde047 0%, #f59e0b 100%)',
  color: '#3b2200',
  border: '1px solid rgba(245, 158, 11, 0.58)',
  borderRadius: 18,
  padding: '16px 28px',
  minWidth: 220,
  fontSize: 20,
  fontWeight: 900,
  cursor: 'pointer',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.4), 0 20px 34px rgba(146, 64, 14, 0.24)',
}

const mapFooterNote: React.CSSProperties = {
  marginTop: 12,
  padding: '10px 14px',
  borderRadius: 14,
  background: 'rgba(15, 23, 42, 0.78)',
  border: '1px solid rgba(71, 85, 105, 0.4)',
  color: '#e5e7eb',
  fontSize: 12,
  wordBreak: 'break-all',
}

const errorBanner: React.CSSProperties = {
  marginTop: 12,
  padding: '12px 14px',
  borderRadius: 14,
  background: 'rgba(127, 29, 29, 0.9)',
  border: '1px solid rgba(248, 113, 113, 0.5)',
  color: '#fee2e2',
  fontSize: 13,
  lineHeight: 1.45,
}

const actionPrimaryButton: React.CSSProperties = {
  background: 'linear-gradient(180deg, #34d399 0%, #059669 100%)',
  color: '#06281d',
  border: '1px solid rgba(16, 185, 129, 0.45)',
  height: 48,
  padding: '0 18px',
  borderRadius: 14,
  cursor: 'pointer',
  fontWeight: 800,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.35)',
}

const actionSecondaryButton: React.CSSProperties = {
  background: 'linear-gradient(180deg, #93c5fd 0%, #3b82f6 100%)',
  color: '#0f172a',
  border: '1px solid rgba(59, 130, 246, 0.45)',
  height: 48,
  padding: '0 18px',
  borderRadius: 14,
  cursor: 'pointer',
  fontWeight: 800,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.35)',
}

const actionGoldButton: React.CSSProperties = {
  background: 'linear-gradient(180deg, #fbbf24 0%, #f59e0b 100%)',
  color: '#3b2200',
  border: '1px solid rgba(245, 158, 11, 0.45)',
  height: 48,
  padding: '0 18px',
  borderRadius: 14,
  cursor: 'pointer',
  fontWeight: 900,
  whiteSpace: 'nowrap',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.35)',
}

const upgradeModalOverlay: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  zIndex: 8,
  display: 'grid',
  placeItems: 'center',
  background: 'rgba(2, 6, 23, 0.36)',
}

const upgradeModalCard: React.CSSProperties = {
  display: 'grid',
  gap: 12,
  width: 'min(100%, 420px)',
  padding: '22px 22px 20px',
  borderRadius: 20,
  border: '1px solid rgba(148, 163, 184, 0.42)',
  background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.96), rgba(30, 41, 59, 0.94))',
  boxShadow: '0 26px 46px rgba(2, 6, 23, 0.34)',
  color: '#f8fafc',
}

const upgradeModalActions: React.CSSProperties = {
  marginTop: 4,
  display: 'flex',
  gap: 10,
  justifyContent: 'flex-end',
}

const upgradeCancelButton: React.CSSProperties = {
  height: 42,
  padding: '0 14px',
  borderRadius: 12,
  border: '1px solid rgba(100, 116, 139, 0.46)',
  background: 'rgba(15, 23, 42, 0.75)',
  color: '#e5e7eb',
  fontWeight: 700,
  cursor: 'pointer',
}

const upgradeConfirmButton: React.CSSProperties = {
  height: 42,
  padding: '0 16px',
  borderRadius: 12,
  border: '1px solid rgba(245, 158, 11, 0.52)',
  background: 'linear-gradient(180deg, #fbbf24 0%, #f59e0b 100%)',
  color: '#3b2200',
  fontWeight: 900,
  cursor: 'pointer',
}

const emptyInventory: React.CSSProperties = {
  border: '1px dashed #475569',
  borderRadius: 14,
  padding: 14,
  color: '#94a3b8',
  background: 'rgba(15, 23, 42, 0.45)',
}

const inventoryCard: React.CSSProperties = {
  display: 'grid',
  gap: 12,
  padding: 14,
  borderRadius: 16,
  border: '1px solid #334155',
  background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.96), rgba(30, 41, 59, 0.94))',
  cursor: 'grab',
}

const inventoryToggle: React.CSSProperties = {
  position: 'absolute',
  top: 60,
  zIndex: 40,
  width: 44,
  height: 60,
  borderRadius: '16px 0 0 16px',
  border: '1px solid rgba(71, 85, 105, 0.9)',
  borderRight: 0,
  background: 'linear-gradient(180deg, #1e293b 0%, #0f172a 100%)',
  color: '#f8fafc',
  fontSize: 22,
  fontWeight: 700,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  boxShadow: '0 14px 28px rgba(2, 6, 23, 0.24)',
  transition: 'right 180ms ease',
}

const inventoryDrawer: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  right: 0,
  bottom: 0,
  width: 356,
  zIndex: 45,
  display: 'grid',
  alignContent: 'start',
  gap: 14,
  padding: '24px 22px',
  overflowY: 'auto',
  borderRadius: '0 28px 28px 0',
  borderLeft: '1px solid rgba(71, 85, 105, 0.85)',
  background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.98), rgba(17, 24, 39, 0.98))',
  boxShadow: '0 24px 60px rgba(2, 6, 23, 0.38)',
  transition: 'transform 180ms ease, opacity 180ms ease, visibility 180ms ease',
}

const inventoryDrawerHeader: React.CSSProperties = {
  display: 'grid',
  gap: 6,
}

const inventoryActions: React.CSSProperties = {
  display: 'grid',
  gap: 10,
}

const deleteButton: React.CSSProperties = {
  background: 'rgba(239, 68, 68, 0.12)',
  color: '#fecaca',
  border: '1px solid rgba(239, 68, 68, 0.32)',
  padding: '10px 14px',
  borderRadius: 12,
  cursor: 'pointer',
  fontWeight: 700,
}

const deleteButtonActive: React.CSSProperties = {
  ...deleteButton,
  background: '#dc2626',
  color: '#fff',
  border: '1px solid #f87171',
}

const deleteHint: React.CSSProperties = {
  fontSize: 13,
  color: '#fecaca',
}

const dragBadge: React.CSSProperties = {
  alignSelf: 'start',
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: 0.5,
  textTransform: 'uppercase',
  color: '#fef3c7',
  background: 'rgba(245, 158, 11, 0.16)',
  border: '1px solid rgba(245, 158, 11, 0.35)',
  borderRadius: 999,
  padding: '4px 8px',
}

const shapeGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, 18px)',
  gap: 4,
}

const shapeCellFilled: React.CSSProperties = {
  width: 18,
  height: 18,
  borderRadius: 6,
  background: 'linear-gradient(180deg, #fcd34d, #f59e0b)',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.35)',
}

const shapeCellEmpty: React.CSSProperties = {
  width: 18,
  height: 18,
  borderRadius: 6,
  background: 'rgba(51, 65, 85, 0.45)',
  border: '1px dashed rgba(100, 116, 139, 0.45)',
}

const cityBoardShell: React.CSSProperties = {
  position: 'relative',
  display: 'grid',
  alignContent: 'center',
  justifyContent: 'center',
  justifyItems: 'center',
  width: '100%',
  height: '100%',
  minHeight: 0,
  padding: '112px 24px 28px',
  borderRadius: 28,
  overflow: 'hidden',
  background: 'linear-gradient(180deg, #b4df74 0%, #8cc955 36%, #72b13f 100%)',
  border: '1px solid rgba(120, 168, 69, 0.9)',
  boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.3), 0 24px 60px rgba(2, 6, 23, 0.22)',
}

const cityBoardBackdrop: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  background: 'radial-gradient(circle at 50% 12%, rgba(255, 255, 255, 0.14), transparent 20%), radial-gradient(circle at 20% 22%, rgba(255, 255, 255, 0.09), transparent 14%), radial-gradient(circle at 82% 26%, rgba(255, 255, 255, 0.08), transparent 12%), repeating-linear-gradient(135deg, rgba(255, 255, 255, 0.03) 0 6px, rgba(0, 0, 0, 0) 6px 18px)',
  pointerEvents: 'none',
}

const cityBoard: React.CSSProperties = {
  position: 'relative',
  width: GRID_SIZE * TILE_WIDTH,
  height: GRID_SIZE * TILE_HEIGHT + TILE_HEIGHT,
  zIndex: 1,
  margin: '0 auto',
}

const tileButton: React.CSSProperties = {
  position: 'absolute',
  width: TILE_WIDTH,
  height: TILE_HEIGHT,
  border: 0,
  borderRadius: 0,
  background: 'transparent',
  color: '#fff',
  cursor: 'pointer',
  padding: 0,
  overflow: 'visible',
  transition: 'transform 140ms ease, filter 140ms ease',
}

const tileGround: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)',
  background: 'linear-gradient(135deg, #9be25b 0%, #8dd951 26%, #77c446 62%, #68ac3c 100%)',
  boxShadow: 'inset 0 2px 0 rgba(255, 255, 255, 0.18), inset -7px -7px 0 rgba(61, 118, 34, 0.15)',
}

const tileGrassTexture: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)',
  background: 'repeating-linear-gradient(120deg, rgba(185, 255, 138, 0.16) 0 2px, rgba(0, 0, 0, 0) 2px 8px), repeating-linear-gradient(55deg, rgba(76, 145, 35, 0.15) 0 3px, rgba(0, 0, 0, 0) 3px 10px)',
  opacity: 0.95,
}

const tileGrassHighlight: React.CSSProperties = {
  position: 'absolute',
  inset: `${Math.round(TILE_HEIGHT * 0.1)}px ${Math.round(TILE_WIDTH * 0.1)}px ${Math.round(TILE_HEIGHT * 0.34)}px ${Math.round(TILE_WIDTH * 0.12)}px`,
  clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)',
  background: 'radial-gradient(circle at 35% 32%, rgba(217, 255, 163, 0.55), rgba(217, 255, 163, 0.08) 58%, rgba(0,0,0,0) 72%)',
}

const previewOverlay: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)',
}

const tileShade: React.CSSProperties = {
  position: 'absolute',
  left: '50%',
  bottom: Math.round(TILE_HEIGHT * 0.28),
  width: Math.round(TILE_WIDTH * 0.34),
  height: Math.round(TILE_HEIGHT * 0.22),
  transform: 'translateX(-50%)',
  borderRadius: 999,
  background: 'rgba(58, 96, 26, 0.24)',
}

const resourceMarkerDot: React.CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: 999,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'rgba(15, 23, 42, 0.96)',
  border: '1px solid rgba(148, 163, 184, 0.45)',
  fontSize: 18,
  fontWeight: 900,
  lineHeight: 1,
  textShadow: '0 1px 0 rgba(255, 255, 255, 0.1)',
}

const resourceCooldownPill: React.CSSProperties = {
  minHeight: 28,
  padding: '0 11px',
  borderRadius: 999,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'rgba(15, 23, 42, 0.92)',
  border: '1px solid rgba(148, 163, 184, 0.38)',
  color: '#f8fafc',
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: 0.2,
  boxShadow: '0 10px 18px rgba(15, 23, 42, 0.24)',
  whiteSpace: 'nowrap',
}

const emptyPatchStyle: React.CSSProperties = {
  position: 'absolute',
  left: Math.round(TILE_WIDTH * 0.26),
  right: Math.round(TILE_WIDTH * 0.28),
  bottom: Math.round(TILE_HEIGHT * 0.42),
  height: Math.round(TILE_HEIGHT * 0.2),
  borderRadius: 999,
  background: 'rgba(194, 247, 130, 0.42)',
  transform: 'rotate(-18deg)',
}

const emptyStoneStyle: React.CSSProperties = {
  position: 'absolute',
  right: Math.round(TILE_WIDTH * 0.29),
  bottom: Math.round(TILE_HEIGHT * 0.42),
  width: Math.round(TILE_WIDTH * 0.11),
  height: Math.round(TILE_HEIGHT * 0.14),
  borderRadius: 999,
  background: 'rgba(111, 135, 74, 0.8)',
}
