'use client'
// Procedural SVG hamster — unique look per NFT, rarity sets colour theme

export type HeroSnapshot = {
  id: bigint
  rarity: number
  total: { atk: number; def_: number; hp: number; agi: number; lck: number }
}

export const RARITY_THEMES = [
  { ring: '#C8943C', bg: 'rgba(200,148,60,0.18)',  glow: 'rgba(200,148,60,0.5)',  label: 'Common'    },
  { ring: '#38bdf8', bg: 'rgba(56,189,248,0.18)',  glow: 'rgba(56,189,248,0.5)',  label: 'Rare'      },
  { ring: '#c084fc', bg: 'rgba(192,132,252,0.18)', glow: 'rgba(192,132,252,0.5)', label: 'Epic'      },
  { ring: '#facc15', bg: 'rgba(250,204,21,0.18)',  glow: 'rgba(250,204,21,0.5)',  label: 'Legendary' },
]

// Rarity → fur palette
const FURS = [
  // 0 Common — warm creams / browns
  [
    { body:'#E8B070', belly:'#F5D5B0', ear:'#FFCCC0', shadow:'#B07840', outline:'#6A3C18' },
    { body:'#F0E0C8', belly:'#FFF5E8', ear:'#FFD4CC', shadow:'#C8A880', outline:'#7A5838' },
    { body:'#D4A870', belly:'#ECD8C0', ear:'#FFCCC0', shadow:'#A07040', outline:'#5A3018' },
    { body:'#C8A890', belly:'#E8D4C0', ear:'#FFCCC0', shadow:'#987060', outline:'#503020' },
    { body:'#B8B8A8', belly:'#E0E0D4', ear:'#FFCCC0', shadow:'#888870', outline:'#484840' },
    { body:'#D8A060', belly:'#F0CC90', ear:'#FFCCC0', shadow:'#A87030', outline:'#603810' },
  ],
  // 1 Rare — blue / ice
  [
    { body:'#90C0F0', belly:'#C8E4FC', ear:'#FFB8CC', shadow:'#5088C0', outline:'#204878' },
    { body:'#70A8E0', belly:'#A8D0F8', ear:'#FFB8CC', shadow:'#3870B8', outline:'#183060' },
    { body:'#A8C8F0', belly:'#D0E8FC', ear:'#FFB8CC', shadow:'#6898C8', outline:'#284880' },
    { body:'#B0CCE8', belly:'#D8E8F8', ear:'#FFB8CC', shadow:'#7898C0', outline:'#304870' },
  ],
  // 2 Epic — purple
  [
    { body:'#B090D8', belly:'#D8C0F0', ear:'#FFB8D8', shadow:'#7858A8', outline:'#402870' },
    { body:'#9878C8', belly:'#C8A8E8', ear:'#FFB8D8', shadow:'#6040A0', outline:'#381868' },
    { body:'#C8A8E0', belly:'#E8D0F8', ear:'#FFB8D8', shadow:'#9070B8', outline:'#503878' },
    { body:'#A888D0', belly:'#D0B0E8', ear:'#FFB8D8', shadow:'#7050A8', outline:'#402870' },
  ],
  // 3 Legendary — gold
  [
    { body:'#F0B830', belly:'#FFE070', ear:'#FFEEA0', shadow:'#C08000', outline:'#705000' },
    { body:'#E8A820', belly:'#FFD050', ear:'#FFE890', shadow:'#B07000', outline:'#603800' },
    { body:'#F8CC40', belly:'#FFEE80', ear:'#FFF4B0', shadow:'#D09010', outline:'#705800' },
  ],
]

const EYE_COLORS = [
  '#1a1a2e','#1a3a6e','#1a5a2e','#6e2a1a',
  '#3a1a6e','#6e3a1a','#1a4a4a','#4a1a4a',
  '#2a4a1a','#6e1a3a','#1a2a6e','#005f5f',
]

type Hat = 'none'|'bow'|'cap'|'crown'|'wizard'|'tophat'|'headband'|'viking'|'party'|'witch'|'halo'
type Acc = 'none'|'star'|'gem'|'heart'|'lightning'|'clover'|'shield'|'coin'|'wand'

// Common gets simpler hats; higher rarities get flashier ones
const HATS_BY_RARITY: Hat[][] = [
  ['none','none','bow','cap','none','bow','cap','none'],
  ['cap','wizard','none','cap','party','headband','none','cap'],
  ['witch','wizard','party','none','witch','headband','none','wizard'],
  ['crown','tophat','halo','crown','crown','tophat','halo','crown'],
]
const ACCS_BY_RARITY: Acc[][] = [
  ['none','none','heart','star','clover','none','none','heart'],
  ['star','gem','shield','lightning','none','star','clover','gem'],
  ['wand','gem','star','lightning','clover','wand','heart','gem'],
  ['coin','gem','star','coin','wand','gem','coin','star'],
]

function pick<T>(arr: T[], n: number): T {
  return arr[Math.abs(Math.floor(n)) % arr.length]!
}

export function HamsterAvatar({ hero, size = 200 }: { hero: HeroSnapshot; size?: number }) {
  const id  = Number(hero.id)
  const rar = Math.min(hero.rarity, 3)

  const furSet  = FURS[rar] ?? FURS[0]!
  const fur     = pick(furSet, id)
  const theme   = RARITY_THEMES[rar] ?? RARITY_THEMES[0]!
  const eyeCol  = pick(EYE_COLORS, hero.total.agi + id * 3)
  const hat: Hat = pick(HATS_BY_RARITY[rar]!, hero.total.atk + id)
  const acc: Acc = pick(ACCS_BY_RARITY[rar]!, hero.total.lck + id * 5)

  const cheekRx = 18 + (id % 8)
  const cheekRy = 13 + (id % 5)
  const eyeR    = 13 + (hero.total.agi % 5)
  const pupilDx = (id % 3) - 1
  const wideSmile = hero.total.def_ % 2 === 0
  const gid = `hg${id}r${rar}`

  return (
    <svg width={size} height={size} viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id={`${gid}bg`} cx="50%" cy="65%" r="55%">
          <stop offset="0%"   stopColor={theme.ring} stopOpacity="0.28"/>
          <stop offset="100%" stopColor={theme.ring} stopOpacity="0"/>
        </radialGradient>
        <radialGradient id={`${gid}f`} cx="38%" cy="28%" r="70%">
          <stop offset="0%"   stopColor={fur.belly}/>
          <stop offset="60%"  stopColor={fur.body}/>
          <stop offset="100%" stopColor={fur.shadow}/>
        </radialGradient>
        <radialGradient id={`${gid}c`} cx="40%" cy="35%" r="65%">
          <stop offset="0%"   stopColor={fur.belly}/>
          <stop offset="100%" stopColor={fur.body}/>
        </radialGradient>
      </defs>

      {/* BG */}
      <rect width="200" height="200" rx="22" fill="#0d1117"/>
      <rect width="200" height="200" rx="22" fill={`url(#${gid}bg)`}/>
      <rect x="2.5" y="2.5" width="195" height="195" rx="20"
        fill="none" stroke={theme.ring} strokeWidth="2" opacity="0.55"/>

      {/* Shadow */}
      <ellipse cx="100" cy="186" rx="46" ry="7" fill={fur.outline} opacity="0.2"/>

      {/* Ears */}
      <ellipse cx="70" cy="75" rx="21" ry="23" fill={`url(#${gid}f)`} stroke={fur.outline} strokeWidth="1.5"/>
      <ellipse cx="130" cy="75" rx="21" ry="23" fill={`url(#${gid}f)`} stroke={fur.outline} strokeWidth="1.5"/>
      <ellipse cx="70" cy="75" rx="12" ry="14" fill={fur.ear}/>
      <ellipse cx="130" cy="75" rx="12" ry="14" fill={fur.ear}/>

      {/* Body */}
      <ellipse cx="100" cy="148" rx="56" ry="44" fill={`url(#${gid}f)`} stroke={fur.outline} strokeWidth="1.5"/>

      {/* Head */}
      <circle cx="100" cy="108" r="54" fill={`url(#${gid}f)`} stroke={fur.outline} strokeWidth="1.5"/>

      {/* Belly */}
      <ellipse cx="100" cy="158" rx="30" ry="22" fill={fur.belly} opacity="0.7"/>

      {/* Cheeks */}
      <ellipse cx="51"  cy="120" rx={cheekRx} ry={cheekRy} fill={`url(#${gid}c)`} stroke={fur.outline} strokeWidth="1"/>
      <ellipse cx="149" cy="120" rx={cheekRx} ry={cheekRy} fill={`url(#${gid}c)`} stroke={fur.outline} strokeWidth="1"/>
      <ellipse cx="53"  cy="125" rx="12" ry="7" fill="#FF6080" opacity="0.3"/>
      <ellipse cx="147" cy="125" rx="12" ry="7" fill="#FF6080" opacity="0.3"/>

      {/* Eyes */}
      <circle cx="82"  cy="101" r={eyeR}     fill="white" stroke={fur.outline} strokeWidth="1"/>
      <circle cx="118" cy="101" r={eyeR}     fill="white" stroke={fur.outline} strokeWidth="1"/>
      <circle cx={82+pupilDx}  cy="101" r={eyeR-4} fill={eyeCol}/>
      <circle cx={118+pupilDx} cy="101" r={eyeR-4} fill={eyeCol}/>
      <circle cx={82+pupilDx}  cy="101" r={eyeR-9} fill="#0d1117"/>
      <circle cx={118+pupilDx} cy="101" r={eyeR-9} fill="#0d1117"/>
      <circle cx={85+pupilDx}  cy="97"  r="3.5" fill="white"/>
      <circle cx={121+pupilDx} cy="97"  r="3.5" fill="white"/>
      <circle cx={80+pupilDx}  cy="105" r="2"   fill="white" opacity="0.5"/>
      <circle cx={116+pupilDx} cy="105" r="2"   fill="white" opacity="0.5"/>

      {/* Nose */}
      <ellipse cx="100" cy="117" rx="5" ry="4" fill="#FF4466" stroke={fur.outline} strokeWidth="0.8"/>
      <circle cx="97" cy="118" r="1.5" fill="#CC2255" opacity="0.55"/>
      <circle cx="103" cy="118" r="1.5" fill="#CC2255" opacity="0.55"/>

      {/* Mouth */}
      <path d={wideSmile ? 'M87 126 Q100 139 113 126' : 'M90 125 Q100 133 110 125'}
        stroke={fur.outline} strokeWidth="2.2" fill="none" strokeLinecap="round"/>

      {/* Whiskers */}
      <line x1="38" y1="116" x2="70" y2="119" stroke={fur.outline} strokeWidth="1" opacity="0.35"/>
      <line x1="38" y1="123" x2="70" y2="122" stroke={fur.outline} strokeWidth="1" opacity="0.35"/>
      <line x1="130" y1="119" x2="162" y2="116" stroke={fur.outline} strokeWidth="1" opacity="0.35"/>
      <line x1="130" y1="122" x2="162" y2="123" stroke={fur.outline} strokeWidth="1" opacity="0.35"/>

      {/* Paws */}
      <ellipse cx="72"  cy="178" rx="18" ry="9" fill={`url(#${gid}f)`} stroke={fur.outline} strokeWidth="1.2"/>
      <ellipse cx="128" cy="178" rx="18" ry="9" fill={`url(#${gid}f)`} stroke={fur.outline} strokeWidth="1.2"/>
      {[63,72,81].map(x => <ellipse key={x} cx={x} cy="182" rx="4" ry="3" fill={fur.shadow} opacity="0.5"/>)}
      {[119,128,137].map(x => <ellipse key={x} cx={x} cy="182" rx="4" ry="3" fill={fur.shadow} opacity="0.5"/>)}

      {/* ══ HATS ══ */}
      {hat==='bow' && (
        <g>
          <ellipse cx="83"  cy="66" rx="12" ry="8" fill="#FF6088" transform="rotate(-25 83 66)"/>
          <ellipse cx="117" cy="66" rx="12" ry="8" fill="#FF6088" transform="rotate(25 117 66)"/>
          <circle cx="100" cy="66" r="7" fill="#FF3060"/>
        </g>
      )}
      {hat==='cap' && (
        <g>
          <ellipse cx="100" cy="61" rx="37" ry="9" fill="#2D4A7A"/>
          <rect x="70" y="33" width="60" height="30" rx="10" fill="#3B5E9A"/>
          <rect x="72" y="35" width="56" height="7"  rx="4"  fill="#4A72B8" opacity="0.45"/>
        </g>
      )}
      {hat==='crown' && (
        <g>
          <polygon points="66,62 74,35 87,53 100,28 113,53 126,35 134,62" fill="#FFD700"/>
          <rect x="66" y="57" width="68" height="10" rx="5" fill="#E6B800"/>
          <circle cx="100" cy="31" r="6"   fill="#EF4444"/>
          <circle cx="78"  cy="49" r="4.5" fill="#3B82F6"/>
          <circle cx="122" cy="49" r="4.5" fill="#22C55E"/>
        </g>
      )}
      {hat==='wizard' && (
        <g>
          <polygon points="100,4 71,64 129,64" fill="#4C1D95"/>
          <ellipse cx="100" cy="64" rx="31" ry="9" fill="#5B21B6"/>
          <circle cx="92" cy="38" r="4.5" fill="#FDE68A" opacity="0.9"/>
          <circle cx="108" cy="25" r="3.5" fill="#FDE68A" opacity="0.9"/>
          <circle cx="83" cy="56" r="3"   fill="#FDE68A" opacity="0.7"/>
        </g>
      )}
      {hat==='tophat' && (
        <g>
          <rect x="72" y="22" width="56" height="42" rx="6" fill="#1F2937"/>
          <rect x="60" y="60" width="80" height="10" rx="5" fill="#111827"/>
          <rect x="72" y="56" width="56" height="8"  rx="3" fill={theme.ring} opacity="0.8"/>
        </g>
      )}
      {hat==='headband' && (
        <rect x="62" y="70" width="76" height="12" rx="6" fill={theme.ring} opacity="0.9"/>
      )}
      {hat==='viking' && (
        <g>
          <ellipse cx="100" cy="62" rx="36" ry="19" fill="#92400E"/>
          <ellipse cx="66"  cy="52" rx="10" ry="18" fill="#D97706" transform="rotate(-20 66 52)"/>
          <ellipse cx="134" cy="52" rx="10" ry="18" fill="#D97706" transform="rotate(20 134 52)"/>
          <ellipse cx="66"  cy="52" rx="6"  ry="11" fill="#F59E0B" transform="rotate(-20 66 52)"/>
          <ellipse cx="134" cy="52" rx="6"  ry="11" fill="#F59E0B" transform="rotate(20 134 52)"/>
          <rect x="66" y="72" width="68" height="8" rx="4" fill="#78350F"/>
        </g>
      )}
      {hat==='party' && (
        <g>
          <polygon points="100,4 74,64 126,64" fill={theme.ring}/>
          <polygon points="100,4 74,64 126,64" fill="white" opacity="0.15"/>
          <ellipse cx="100" cy="64" rx="28" ry="8" fill={theme.ring} opacity="0.7"/>
          <circle cx="100" cy="4" r="5" fill="white"/>
          <circle cx="90" cy="35" r="3"   fill="white" opacity="0.6"/>
          <circle cx="108" cy="48" r="2.5" fill="white" opacity="0.6"/>
        </g>
      )}
      {hat==='witch' && (
        <g>
          <polygon points="100,2 68,64 132,64" fill="#1a0030"/>
          <ellipse cx="100" cy="64" rx="33" ry="10" fill="#2d004a"/>
          <rect x="66" y="60" width="68" height="8" rx="4" fill="#7C3AED" opacity="0.8"/>
          <circle cx="92" cy="40" r="4" fill="#a855f7" opacity="0.8"/>
          <circle cx="108" cy="28" r="3" fill="#a855f7" opacity="0.8"/>
        </g>
      )}
      {hat==='halo' && (
        <g>
          <ellipse cx="100" cy="50" rx="33" ry="9" fill="none" stroke="#FDE68A" strokeWidth="5" opacity="0.85"/>
          <ellipse cx="100" cy="50" rx="33" ry="9" fill="none" stroke={theme.ring} strokeWidth="2"/>
        </g>
      )}

      {/* ══ ACCESSORIES ══ */}
      {acc==='star' && (
        <g transform="translate(148,70)">
          <polygon points="13,0 16,9 26,9 18,15 21,24 13,19 5,24 8,15 0,9 10,9"
            fill="#FDE68A" stroke="#F59E0B" strokeWidth="1"/>
        </g>
      )}
      {acc==='gem' && (
        <g transform="translate(148,72)">
          <polygon points="13,0 25,9 21,24 5,24 1,9" fill="#67E8F9" stroke="#0EA5E9" strokeWidth="1"/>
          <polygon points="13,4 22,10 13,22 4,10" fill="white" opacity="0.3"/>
        </g>
      )}
      {acc==='heart' && (
        <g transform="translate(150,72)">
          <path d="M13 22 C5 14,-3 8,2 2 C5-2,13 1,13 7 C13 1,21-2,24 2 C29 8,21 14,13 22Z"
            fill="#F43F5E" stroke="#BE123C" strokeWidth="0.5"/>
        </g>
      )}
      {acc==='lightning' && (
        <g transform="translate(149,70)">
          <polygon points="14,0 5,14 12,14 7,28 23,10 15,10"
            fill="#FDE68A" stroke="#EAB308" strokeWidth="0.8"/>
        </g>
      )}
      {acc==='clover' && (
        <g transform="translate(24,70)">
          <circle cx="13" cy="8"  r="7.5" fill="#4ADE80"/>
          <circle cx="21" cy="16" r="7.5" fill="#4ADE80"/>
          <circle cx="13" cy="24" r="7.5" fill="#4ADE80"/>
          <circle cx="5"  cy="16" r="7.5" fill="#4ADE80"/>
          <rect x="11" y="18" width="4" height="10" rx="2" fill="#22C55E"/>
        </g>
      )}
      {acc==='shield' && (
        <g transform="translate(24,72)">
          <path d="M13 0 L25 5 L25 17 C25 23,13 29,13 29 C13 29,1 23,1 17 L1 5 Z"
            fill="#3B82F6" stroke="#1D4ED8" strokeWidth="1"/>
          <path d="M13 6 L20 9 L20 16 C20 20,13 24,13 24 C13 24,6 20,6 16 L6 9 Z"
            fill="#60A5FA" opacity="0.45"/>
        </g>
      )}
      {acc==='coin' && (
        <g transform="translate(148,72)">
          <circle cx="13" cy="13" r="13" fill="#FCD34D" stroke="#D97706" strokeWidth="1.5"/>
          <circle cx="13" cy="13" r="9" fill="#FDE68A"/>
          <text x="13" y="18" textAnchor="middle" fontSize="11" fontWeight="900" fill="#92400E">$</text>
        </g>
      )}
      {acc==='wand' && (
        <g transform="translate(148,68)">
          <line x1="4" y1="27" x2="22" y2="4" stroke="#7C3AED" strokeWidth="3" strokeLinecap="round"/>
          <circle cx="22" cy="4" r="6" fill="#A78BFA"/>
          <circle cx="22" cy="4" r="3" fill="white" opacity="0.7"/>
        </g>
      )}

      {/* Rarity label */}
      <rect x="8" y="176" width="184" height="16" rx="8" fill={theme.ring} opacity="0.15"/>
      <text x="100" y="188" textAnchor="middle" fontSize="8.5" fontWeight="800"
        letterSpacing="2.5" fill={theme.ring} fontFamily="system-ui,sans-serif">
        {theme.label.toUpperCase()}
      </text>
    </svg>
  )
}
