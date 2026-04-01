const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as const

export const CITY_ADDRESS = (process.env.NEXT_PUBLIC_CITY_ADDRESS ?? '0xe7f1725e7734ce288f8367e1bb143e90bb3f0512') as `0x${string}`
export const TOKEN_ADDRESS = (process.env.NEXT_PUBLIC_TOKEN_ADDRESS ?? '0x5fbdb2315678afecb367f032d93f642f64180aa3') as `0x${string}`
export const HERO_CURRENCY_ADDRESS = (process.env.NEXT_PUBLIC_HERO_CURRENCY_ADDRESS ?? ZERO_ADDRESS) as `0x${string}`
export const HERO_NFT_ADDRESS = (process.env.NEXT_PUBLIC_HERO_NFT_ADDRESS ?? ZERO_ADDRESS) as `0x${string}`
export const PACK_OPENER_ADDRESS = (process.env.NEXT_PUBLIC_PACK_OPENER_ADDRESS ?? ZERO_ADDRESS) as `0x${string}`
export const PVP_BATTLES_ADDRESS = (process.env.NEXT_PUBLIC_PVP_BATTLES_ADDRESS ?? ZERO_ADDRESS) as `0x${string}`
export const HERO_MARKETPLACE_ADDRESS = (process.env.NEXT_PUBLIC_HERO_MARKETPLACE_ADDRESS ?? ZERO_ADDRESS) as `0x${string}`
// City contract IS the BuildingItem (CityFiled extends BuildingFactory extends BuildingItem)
export const BUILDING_ITEM_ADDRESS = CITY_ADDRESS
export const BUILDING_MARKETPLACE_ADDRESS = (process.env.NEXT_PUBLIC_BUILDING_MARKETPLACE_ADDRESS ?? ZERO_ADDRESS) as `0x${string}`
export const ENABLE_TEST_ACTIONS = process.env.NEXT_PUBLIC_ENABLE_TEST_ACTIONS === 'true'

export function isConfiguredAddress(address: `0x${string}`) {
  return /^0x[a-fA-F0-9]{40}$/.test(address) && address.toLowerCase() !== ZERO_ADDRESS
}

export const cityAbi = [
  {
    type: 'function',
    name: 'MAP_SIZE',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
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
    name: 'getCityStats',
    stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [
      { name: 'level', type: 'uint8' },
      { name: 'power', type: 'uint256' },
    ],
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
    name: 'getUpgradeLevelPrice',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
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
  {
    type: 'function',
    name: 'getCityCoord',
    stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [
      { name: 'x', type: 'uint32' },
      { name: 'y', type: 'uint32' },
    ],
  },
  {
    type: 'function',
    name: 'getAllCityOwners',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: 'owners', type: 'address[]' }],
  },
  {
    type: 'function',
    name: 'getCityStats',
    stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [
      { name: 'level', type: 'uint8' },
      { name: 'power', type: 'uint256' },
      { name: 'defense', type: 'uint256' },
    ],
  },
  {
    type: 'event',
    name: 'PowerGained',
    anonymous: false,
    inputs: [{ name: 'power', type: 'uint256', indexed: false }],
  },
  {
    type: 'event',
    name: 'FieldChanged',
    anonymous: false,
    inputs: [],
  },
  {
    type: 'event',
    name: 'LevelUpgraded',
    anonymous: false,
    inputs: [
      { name: 'addr', type: 'address', indexed: true },
      { name: 'level', type: 'uint8', indexed: false },
    ],
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
    name: 'heroIdsOf',
    stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ name: '', type: 'uint256[]' }],
  },
  {
    type: 'function',
    name: 'heroCountOf',
    stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
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
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'tokenId', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'getApproved',
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

export const pvpBattlesAbi = [
  {
    type: 'function',
    name: 'attackerLockedUntil',
    stateMutability: 'view',
    inputs: [{ name: '', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'playerBattleIds',
    stateMutability: 'view',
    inputs: [{ name: 'player', type: 'address' }],
    outputs: [{ name: '', type: 'uint256[]' }],
  },
  {
    type: 'function',
    name: 'attack',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'defender', type: 'address' }],
    outputs: [{ name: 'battleId', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'battles',
    stateMutability: 'view',
    inputs: [{ name: '', type: 'uint256' }],
    outputs: [
      { name: 'timestamp', type: 'uint64' },
      { name: 'attacker', type: 'address' },
      { name: 'defender', type: 'address' },
      { name: 'winner', type: 'address' },
      { name: 'loser', type: 'address' },
      { name: 'rounds', type: 'uint256' },
    ],
  },
  {
    type: 'function',
    name: 'tournamentWins',
    stateMutability: 'view',
    inputs: [{ name: '', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'tournamentRoundStartedAt',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'tournamentPeriodSeconds',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'tournamentReward',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'finalizeTournament',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },
  {
    type: 'event',
    name: 'Attacked',
    inputs: [
      { name: 'battleId', type: 'uint256', indexed: true },
      { name: 'attacker', type: 'address', indexed: true },
      { name: 'defender', type: 'address', indexed: true },
      { name: 'travelTimeSeconds', type: 'uint256', indexed: false },
    ],
    anonymous: false,
  },
] as const

export const heroMarketplaceAbi = [
  {
    type: 'function',
    name: 'feeBps',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint16' }],
  },
  {
    type: 'function',
    name: 'activeListingCount',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  { 
    type: 'function',
    name: 'list',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'tokenId', type: 'uint256' },
      { name: 'price', type: 'uint256' },
    ],
    outputs: [],
  },
  { 
    type: 'function',
    name: 'updatePrice',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'tokenId', type: 'uint256' },
      { name: 'newPrice', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'cancel',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'buy',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'listings',
    stateMutability: 'view',
    inputs: [{ name: '', type: 'uint256' }],
    outputs: [
      { name: 'seller', type: 'address' },
      { name: 'price', type: 'uint256' },
    ],
  },
  {
    type: 'function',
    name: 'getActiveListings',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      {
        name: 'items',
        type: 'tuple[]',
        components: [
          { name: 'tokenId', type: 'uint256' },
          { name: 'seller', type: 'address' },
          { name: 'price', type: 'uint256' },
        ],
      },
    ],
  },
] as const

export const buildingItemAbi = [
  {
    type: 'function',
    name: 'ownerOf',
    stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [{ name: '', type: 'address' }],
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
    name: 'levelUpBuildingPrice',
    stateMutability: 'view',
    inputs: [{ name: '', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'upgradeBuildingLevel',
    stateMutability: 'payable',
    inputs: [{ name: 'buildingId', type: 'uint256' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'getLevelUpBuildingPrice',
    stateMutability: 'view',
    inputs: [{ name: 'buildingId', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const

export const buildingMarketplaceAbi = [
  {
    type: 'function',
    name: 'buildingItem',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function',
    name: 'feeBps',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint16' }],
  },
  {
    type: 'function',
    name: 'DAILY_STOCK',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'stockPrice',
    stateMutability: 'view',
    inputs: [{ name: '', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'getStockInfo',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: 'remaining', type: 'uint256[]' },
      { name: 'prices', type: 'uint256[]' },
    ],
  },
  {
    type: 'function',
    name: 'getActiveListings',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: 'tokenIds', type: 'uint256[]' },
      { name: 'sellers', type: 'address[]' },
      { name: 'prices', type: 'uint256[]' },
    ],
  },
  {
    type: 'function',
    name: 'listings',
    stateMutability: 'view',
    inputs: [{ name: '', type: 'uint256' }],
    outputs: [
      { name: 'seller', type: 'address' },
      { name: 'price', type: 'uint256' },
    ],
  },
  {
    type: 'function',
    name: 'buyFromStock',
    stateMutability: 'payable',
    inputs: [{ name: 'buildingType', type: 'uint8' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'list',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'tokenId', type: 'uint256' },
      { name: 'price', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'updatePrice',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'tokenId', type: 'uint256' },
      { name: 'newPrice', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'cancel',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'buy',
    stateMutability: 'payable',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [],
  },
] as const
