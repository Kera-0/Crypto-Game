'use client'

import { useState } from 'react'
import { parseEther } from 'viem'
import { useAccount, useWaitForTransactionReceipt, useWriteContract } from 'wagmi'
import { Navbar } from '@/components/navbar'
import { CITY_ADDRESS, TOKEN_ADDRESS, cityAbi, tokenAbi } from '@/lib/contracts'

export default function UtilsPage() {
  const { isConnected } = useAccount()
  const { writeContractAsync } = useWriteContract()
  const [hash, setHash] = useState<`0x${string}` | undefined>()
  const [lastAction, setLastAction] = useState<'buildings' | 'token' | null>(null)

  const { isLoading: txPending, isSuccess } = useWaitForTransactionReceipt({
    hash,
    query: { enabled: !!hash },
  })

  async function claimStarterBuildings() {
    const tx = await writeContractAsync({
      address: CITY_ADDRESS,
      abi: cityAbi,
      functionName: 'claimStarterBuildings',
      args: [],
    })

    setLastAction('buildings')
    setHash(tx)
  }

  async function faucetGameToken() {
    const tx = await writeContractAsync({
      address: TOKEN_ADDRESS,
      abi: tokenAbi,
      functionName: 'faucet',
      args: [parseEther('1000')],
    })

    setLastAction('token')
    setHash(tx)
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        padding: '10px 24px 24px',
        background: 'linear-gradient(180deg, #08111f 0%, #111827 100%)',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ marginBottom: 16 }}>
        <Navbar />
      </div>

      <section
        style={{
          maxWidth: 720,
          margin: '48px auto 0',
          padding: 28,
          borderRadius: 24,
          border: '1px solid rgba(71, 85, 105, 0.7)',
          background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.96), rgba(17, 24, 39, 0.94))',
          boxShadow: '0 24px 60px rgba(2, 6, 23, 0.32)',
          color: '#f8fafc',
        }}
      >
        <div style={{ display: 'grid', gap: 10 }}>
          <div style={{ fontSize: 13, letterSpacing: 1, textTransform: 'uppercase', opacity: 0.65 }}>Utility Page</div>
          <h1 style={{ margin: 0, fontSize: 36, lineHeight: 1.05 }}>Starter buildings</h1>
          <div style={{ fontSize: 15, color: '#cbd5e1' }}>
            Hidden service page for calling the old starter-building mint action.
          </div>
        </div>

        <div style={{ marginTop: 28, display: 'grid', gap: 14 }}>
          <div style={{ display: 'grid', gap: 12 }}>
            <button
              onClick={claimStarterBuildings}
              disabled={!isConnected || txPending}
              style={{
                height: 54,
                padding: '0 22px',
                border: '1px solid rgba(245, 158, 11, 0.55)',
                borderRadius: 16,
                background: 'linear-gradient(180deg, #fde047 0%, #f59e0b 100%)',
                color: '#3b2200',
                fontSize: 18,
                fontWeight: 900,
                cursor: !isConnected || txPending ? 'not-allowed' : 'pointer',
                opacity: !isConnected || txPending ? 0.6 : 1,
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.35), 0 16px 30px rgba(146, 64, 14, 0.18)',
              }}
            >
              {txPending && lastAction === 'buildings' ? 'Claiming...' : 'Get Buildings'}
            </button>

            <button
              onClick={faucetGameToken}
              disabled={!isConnected || txPending}
              style={{
                height: 54,
                padding: '0 22px',
                border: '1px solid rgba(59, 130, 246, 0.55)',
                borderRadius: 16,
                background: 'linear-gradient(180deg, #93c5fd 0%, #2563eb 100%)',
                color: '#eff6ff',
                fontSize: 18,
                fontWeight: 900,
                cursor: !isConnected || txPending ? 'not-allowed' : 'pointer',
                opacity: !isConnected || txPending ? 0.6 : 1,
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.3), 0 16px 30px rgba(30, 64, 175, 0.2)',
              }}
            >
              {txPending && lastAction === 'token' ? 'Minting...' : 'Get Test GameToken'}
            </button>
          </div>

          {!isConnected && (
            <div
              style={{
                padding: '12px 14px',
                borderRadius: 14,
                border: '1px solid rgba(71, 85, 105, 0.45)',
                background: 'rgba(15, 23, 42, 0.6)',
                color: '#cbd5e1',
                fontSize: 14,
              }}
            >
              Connect wallet to use this utility action.
            </div>
          )}

          {hash && (
            <div
              style={{
                padding: '12px 14px',
                borderRadius: 14,
                border: '1px solid rgba(71, 85, 105, 0.45)',
                background: 'rgba(15, 23, 42, 0.6)',
                color: '#e2e8f0',
                fontSize: 13,
                wordBreak: 'break-all',
              }}
            >
              tx: {hash}
            </div>
          )}

          {isSuccess && (
            <div
              style={{
                padding: '12px 14px',
                borderRadius: 14,
                border: '1px solid rgba(16, 185, 129, 0.35)',
                background: 'rgba(6, 95, 70, 0.24)',
                color: '#d1fae5',
                fontSize: 14,
              }}
            >
              {lastAction === 'token' ? 'GameTokenLocal faucet minted 1000 test tokens.' : 'Starter buildings claimed.'}
            </div>
          )}
        </div>
      </section>
    </main>
  )
}
