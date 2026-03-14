'use client'

import { useEffect, useMemo, useState } from 'react'
import { useAccount, usePublicClient, useReadContract, useWaitForTransactionReceipt, useWriteContract } from 'wagmi'
import { parseEther, formatEther } from 'viem'
import { CITY_ADDRESS, TOKEN_ADDRESS, cityAbi, tokenAbi } from '@/lib/contracts'
import { Navbar } from '@/components/navbar'

type Cell = {
  row: number
  col: number
  buildingId: bigint
}

const GRID_SIZE = 12

function short(addr?: string) {
  if (!addr) return ''
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

export default function Page() {
  const { address, isConnected } = useAccount()
  const publicClient = usePublicClient()
  const { writeContractAsync } = useWriteContract()

  const [grid, setGrid] = useState<Cell[][]>([])
  const [loadingGrid, setLoadingGrid] = useState(false)
  const [selectedBuildingId, setSelectedBuildingId] = useState('1')
  const [selectedLayer, setSelectedLayer] = useState('0')
  const [selectedCell, setSelectedCell] = useState<{ row: number; col: number } | null>(null)
  const [moveBuildingId, setMoveBuildingId] = useState('1')
  const [upgradeValueEth, setUpgradeValueEth] = useState('0.01')
  const [hash, setHash] = useState<`0x${string}` | undefined>()
  const [ownedIds, setOwnedIds] = useState<bigint[]>([])

  const { data: cityId, refetch: refetchCityId } = useReadContract({
    address: CITY_ADDRESS,
    abi: cityAbi,
    functionName: 'ownerToCity',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  })

  const { data: tokenBalance, refetch: refetchBalance } = useReadContract({
    address: TOKEN_ADDRESS,
    abi: tokenAbi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  })

  const { isLoading: txPending } = useWaitForTransactionReceipt({
    hash,
    query: {
      enabled: !!hash,
    },
  })

  async function refreshOwnedIds() {
    if (!publicClient || !address) return

    const result: bigint[] = []

    for (let i = 0; i < 100; i++) {
      try {
        const id = (await publicClient.readContract({
          address: CITY_ADDRESS,
          abi: cityAbi,
          functionName: 'ownerToBuildingIds',
          args: [address, BigInt(i)],
        })) as bigint

        result.push(id)
      } catch {
        break
      }
    }

    setOwnedIds(result.filter((x) => x !== BigInt(0)))
  }

  async function loadGrid() {
    if (!publicClient || !address || !cityId || cityId === BigInt(0)) {
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
  }

  useEffect(() => {
    loadGrid()
    refreshOwnedIds()
  }, [address, cityId, selectedLayer])

  async function createCity() {
    const tx = await writeContractAsync({
      address: CITY_ADDRESS,
      abi: cityAbi,
      functionName: 'createCity',
      args: [],
    })
    setHash(tx)
    setTimeout(() => {
      refetchCityId()
      loadGrid()
    }, 1500)
  }

  async function putBuilding() {
    if (!selectedCell) return
    const tx = await writeContractAsync({
      address: CITY_ADDRESS,
      abi: cityAbi,
      functionName: 'putBuilding',
      args: [Number(selectedLayer), selectedCell.row, selectedCell.col, BigInt(selectedBuildingId)],
    })
    setHash(tx)
    setTimeout(loadGrid, 1500)
  }

  async function moveBuilding() {
    if (!selectedCell) return
    const tx = await writeContractAsync({
      address: CITY_ADDRESS,
      abi: cityAbi,
      functionName: 'moveBuilding',
      args: [Number(selectedLayer), selectedCell.row, selectedCell.col, BigInt(moveBuildingId)],
    })
    setHash(tx)
    setTimeout(loadGrid, 1500)
  }

  async function removeBuilding(id: string) {
    const tx = await writeContractAsync({
      address: CITY_ADDRESS,
      abi: cityAbi,
      functionName: 'removeBuilding',
      args: [BigInt(id)],
    })
    setHash(tx)
    setTimeout(loadGrid, 1500)
  }

  async function collectMoney() {
    const tx = await writeContractAsync({
      address: CITY_ADDRESS,
      abi: cityAbi,
      functionName: 'getMoney',
      args: [],
    })
    setHash(tx)
    setTimeout(refetchBalance, 1500)
  }

  async function collectPower() {
    const tx = await writeContractAsync({
      address: CITY_ADDRESS,
      abi: cityAbi,
      functionName: 'getPower',
      args: [],
    })
    setHash(tx)
  }

  async function upgradeLevel() {
    const tx = await writeContractAsync({
      address: CITY_ADDRESS,
      abi: cityAbi,
      functionName: 'upgradeLevel',
      args: [],
      value: parseEther(upgradeValueEth),
    })
    setHash(tx)
  }

  const selectedInfo = useMemo(() => {
    if (!selectedCell || !grid.length) return null
    return grid[selectedCell.row]?.[selectedCell.col] ?? null
  }, [selectedCell, grid])

  return (
    <main style={{ padding: '10px 24px 24px' }}>
      <div style={{ marginBottom: 16 }}>
        <Navbar />
      </div>

      {!isConnected && (
        <div style={{ padding: 16, border: '1px solid #334155', borderRadius: 12, background: '#111827' }}>
          Подключи кошелёк, чтобы создать город и взаимодействовать с контрактом.
        </div>
      )}

      {isConnected && (
        <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 24 }}>
          <section style={{ background: '#111827', border: '1px solid #334155', borderRadius: 16, padding: 16 }}>
            <h2 style={{ marginTop: 0 }}>Панель</h2>
            <div style={{ marginBottom: 8 }}>Адрес: {short(address)}</div>
            <div style={{ marginBottom: 8 }}>City ID: {cityId?.toString() ?? '—'}</div>
            <div style={{ marginBottom: 16 }}>Баланс токена: {tokenBalance ? formatEther(tokenBalance) : '0'}</div>

            <button onClick={createCity} disabled={txPending} style={btn}>
              Создать город
            </button>

            <div style={block}>
              <label>Слой</label>
              <input value={selectedLayer} onChange={(e) => setSelectedLayer(e.target.value)} style={input} />
              <button onClick={loadGrid} style={btnAlt}>Обновить поле</button>
            </div>

            <div style={block}>
              <label>Выбранная клетка</label>
              <div>{selectedCell ? `${selectedCell.row}, ${selectedCell.col}` : 'не выбрана'}</div>
              <div style={{ marginTop: 6, opacity: 0.8 }}>
                Building ID: {selectedInfo?.buildingId?.toString() ?? '—'}
              </div>
            </div>

            <div style={block}>
              <label>Поставить здание</label>
              <input value={selectedBuildingId} onChange={(e) => setSelectedBuildingId(e.target.value)} style={input} placeholder="building id" />
              <button onClick={putBuilding} disabled={!selectedCell || txPending} style={btn}>putBuilding</button>
            </div>

            <div style={block}>
              <label>Переместить здание</label>
              <input value={moveBuildingId} onChange={(e) => setMoveBuildingId(e.target.value)} style={input} placeholder="building id" />
              <button onClick={moveBuilding} disabled={!selectedCell || txPending} style={btn}>moveBuilding</button>
            </div>

            <div style={block}>
              <label>Снять здание</label>
              <button onClick={() => removeBuilding(moveBuildingId)} disabled={txPending} style={btnAlt}>removeBuilding</button>
            </div>

            <div style={block}>
              <button onClick={collectMoney} disabled={txPending} style={btn}>getMoney</button>
              <button onClick={collectPower} disabled={txPending} style={btnAlt}>getPower</button>
            </div>

            <div style={block}>
              <label>ETH для upgradeLevel</label>
              <input value={upgradeValueEth} onChange={(e) => setUpgradeValueEth(e.target.value)} style={input} />
              <button onClick={upgradeLevel} disabled={txPending} style={btn}>upgradeLevel</button>
            </div>

            <div style={block}>
              <label>Твои buildingIds</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {ownedIds.map((id) => (
                  <button key={id.toString()} style={chip} onClick={() => {
                    setSelectedBuildingId(id.toString())
                    setMoveBuildingId(id.toString())
                  }}>
                    #{id.toString()}
                  </button>
                ))}
              </div>
            </div>

            {hash && (
              <div style={{ marginTop: 16, fontSize: 12, opacity: 0.8, wordBreak: 'break-all' }}>
                tx: {hash}
              </div>
            )}
          </section>

          <section>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${GRID_SIZE}, 44px)`, gap: 4, justifyContent: 'start' }}>
              {grid.flat().map((cell) => {
                const selected = selectedCell?.row === cell.row && selectedCell?.col === cell.col
                const occupied = cell.buildingId !== BigInt(0)
                return (
                  <button
                    key={`${cell.row}-${cell.col}`}
                    onClick={() => setSelectedCell({ row: cell.row, col: cell.col })}
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 8,
                      border: selected ? '2px solid #f59e0b' : '1px solid #334155',
                      background: occupied ? '#22c55e' : '#1f2937',
                      color: '#fff',
                      cursor: 'pointer',
                      fontSize: 11,
                      lineHeight: 1.1,
                      padding: 4,
                    }}
                    title={`(${cell.row}, ${cell.col}) id=${cell.buildingId.toString()}`}
                  >
                    <div>{cell.row},{cell.col}</div>
                    <div>{occupied ? `#${cell.buildingId}` : ''}</div>
                  </button>
                )
              })}
            </div>

            {loadingGrid && <div style={{ marginTop: 12 }}>Загружаю поле…</div>}
          </section>
        </div>
      )}
    </main>
  )
}

const btn: React.CSSProperties = {
  background: '#2563eb',
  color: 'white',
  border: 0,
  padding: '10px 14px',
  borderRadius: 10,
  cursor: 'pointer',
}

const btnAlt: React.CSSProperties = {
  background: '#374151',
  color: 'white',
  border: 0,
  padding: '10px 14px',
  borderRadius: 10,
  cursor: 'pointer',
}

const input: React.CSSProperties = {
  background: '#0f172a',
  color: 'white',
  border: '1px solid #334155',
  padding: '10px 12px',
  borderRadius: 10,
}

const block: React.CSSProperties = {
  marginTop: 16,
  display: 'grid',
  gap: 8,
}

const chip: React.CSSProperties = {
  background: '#0f172a',
  color: '#fff',
  border: '1px solid #334155',
  padding: '6px 10px',
  borderRadius: 999,
  cursor: 'pointer',
}
