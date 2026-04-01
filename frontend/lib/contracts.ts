const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as const

export const CITY_ADDRESS = (process.env.NEXT_PUBLIC_CITY_ADDRESS ?? '0xe7f1725e7734ce288f8367e1bb143e90bb3f0512') as `0x${string}`
export const TOKEN_ADDRESS = (process.env.NEXT_PUBLIC_TOKEN_ADDRESS ?? '0x5fbdb2315678afecb367f032d93f642f64180aa3') as `0x${string}`
export const HERO_CURRENCY_ADDRESS = (process.env.NEXT_PUBLIC_HERO_CURRENCY_ADDRESS ?? ZERO_ADDRESS) as `0x${string}`
export const HERO_NFT_ADDRESS = (process.env.NEXT_PUBLIC_HERO_NFT_ADDRESS ?? ZERO_ADDRESS) as `0x${string}`
export const PACK_OPENER_ADDRESS = (process.env.NEXT_PUBLIC_PACK_OPENER_ADDRESS ?? ZERO_ADDRESS) as `0x${string}`
export const ENABLE_TEST_ACTIONS = process.env.NEXT_PUBLIC_ENABLE_TEST_ACTIONS === 'true'

export function isConfiguredAddress(address: `0x${string}`) {
  return /^0x[a-fA-F0-9]{40}$/.test(address) && address.toLowerCase() !== ZERO_ADDRESS
}

export const cityAbi = [
  {
    type: 'function',
    name: 'ownerToCity',
    stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'createCity',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },
  {
    type: 'function',
    name: 'getCell',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'layer', type: 'uint8' },
      { name: 'i', type: 'uint8' },
      { name: 'j', type: 'uint8' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'canPlaceBuilding',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'layer', type: 'uint8' },
      { name: 'top', type: 'uint8' },
      { name: 'left', type: 'uint8' },
      { name: 'buildingId', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'putBuilding',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'layer', type: 'uint8' },
      { name: 'top', type: 'uint8' },
      { name: 'left', type: 'uint8' },
      { name: 'buildingId', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'moveBuilding',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'newLayer', type: 'uint8' },
      { name: 'newTop', type: 'uint8' },
      { name: 'newLeft', type: 'uint8' },
      { name: 'buildingId', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'removeBuilding',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'buildingId', type: 'uint256' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'getMoney',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },
  {
    type: 'function',
    name: 'getPower',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },
  {
    type: 'function',
    name: 'upgradeLevel',
    stateMutability: 'payable',
    inputs: [],
    outputs: [],
  },
  {
    type: 'function',
    name: 'setLevelUpPrice',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'level', type: 'uint8' },
      { name: 'price', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'buildings',
    stateMutability: 'view',
    inputs: [{ name: '', type: 'uint256' }],
    outputs: [
      { name: 'dna', type: 'uint64' },
      { name: 'level', type: 'uint32' },
      { name: 'updateReadyTime', type: 'uint256' },
      { name: 'isActive', type: 'bool' },
    ],
  },
  {
    type: 'function',
    name: 'buildingPosition',
    stateMutability: 'view',
    inputs: [{ name: '', type: 'uint256' }],
    outputs: [
      { name: 'layer', type: 'uint8' },
      { name: 'top', type: 'uint8' },
      { name: 'left', type: 'uint8' },
    ],
  },
  {
    type: 'function',
    name: 'getBuildingsByOwner',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'onlyActive', type: 'bool' },
    ],
    outputs: [
      {
        name: '',
        type: 'tuple[]',
        components: [
          { name: 'dna', type: 'uint64' },
          { name: 'level', type: 'uint32' },
          { name: 'updateReadyTime', type: 'uint256' },
          { name: 'isActive', type: 'bool' },
        ],
      },
    ],
  },
  {
    type: 'function',
    name: 'ownerToBuildingIds',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'index', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'claimStarterBuildings',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },
] as const

export const tokenAbi = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'faucet',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'amount', type: 'uint256' }],
    outputs: [],
  },
] as const

export const heroNftAbi = [
  {
    type: 'function',
    name: 'nextId',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'ownerOf',
    stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function',
    name: 'hero',
    stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'rarity', type: 'uint8' },
          {
            name: 'base',
            type: 'tuple',
            components: [
              { name: 'atk', type: 'uint16' },
              { name: 'def_', type: 'uint16' },
              { name: 'hp', type: 'uint16' },
              { name: 'agi', type: 'uint16' },
              { name: 'lck', type: 'uint16' },
            ],
          },
          {
            name: 'bonus',
            type: 'tuple',
            components: [
              { name: 'atk', type: 'uint16' },
              { name: 'def_', type: 'uint16' },
              { name: 'hp', type: 'uint16' },
              { name: 'agi', type: 'uint16' },
              { name: 'lck', type: 'uint16' },
            ],
          },
          {
            name: 'prog',
            type: 'tuple',
            components: [
              { name: 'level', type: 'uint16' },
              { name: 'xp', type: 'uint32' },
              { name: 'upgradesThisLevel', type: 'uint8' },
            ],
          },
        ],
      },
    ],
  },
  {
    type: 'function',
    name: 'totalStats',
    stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'atk', type: 'uint16' },
          { name: 'def_', type: 'uint16' },
          { name: 'hp', type: 'uint16' },
          { name: 'agi', type: 'uint16' },
          { name: 'lck', type: 'uint16' },
        ],
      },
    ],
  },
  {
    type: 'function',
    name: 'applyModule',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'tokenId', type: 'uint256' },
      { name: 'm', type: 'uint8' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'enterTournament',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'tokenId', type: 'uint256' },
      { name: 'tournamentId', type: 'bytes32' },
    ],
    outputs: [],
  },
] as const

export const packOpenerAbi = [
  {
    type: 'function',
    name: 'packPrice',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'buyPack',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [{ name: 'requestId', type: 'uint256' }],
  },
] as const
