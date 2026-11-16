// 18度雞 吉祥物：原創小雞（純 SVG，不需要圖檔）
type Mood = 'happy' | 'smile' | 'sleepy' | 'wow';

interface ChickProps {
  size?: number;
  mood?: Mood;
  /** 戴上小廚師帽 */
  hat?: boolean;
  /** 輕輕晃動 */
  bob?: boolean;
  className?: string;
}

export default function Chick({ size = 64, mood = 'smile', hat = false, bob = false, className = '' }: ChickProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role="img"
      aria-label="18度雞小雞"
      className={`${bob ? 'chick-bob' : ''} ${className}`}
    >
      {/* 影子 */}
      <ellipse cx="50" cy="93" rx="24" ry="4" fill="#000" opacity="0.08" />

      {/* 腳 */}
      <path d="M40 84 v6 M36 90 h8 M60 84 v6 M56 90 h8" stroke="#f08c1a" strokeWidth="3.2" strokeLinecap="round" />

      {/* 頭上的毛 */}
      {!hat && (
        <path
          d="M47 20 C44 12 50 9 51 15 C52 8 59 10 55 19"
          fill="#ffc21f"
          stroke="#f0a500"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      )}

      {/* 身體 */}
      <path
        d="M50 18 C72 18 84 36 84 56 C84 76 70 87 50 87 C30 87 16 76 16 56 C16 36 28 18 50 18 Z"
        fill="#ffd23f"
      />
      {/* 肚子亮面 */}
      <ellipse cx="50" cy="66" rx="22" ry="17" fill="#ffe27a" />
      {/* 頭頂高光 */}
      <ellipse cx="38" cy="32" rx="8" ry="4.5" fill="#fff3b8" opacity="0.8" transform="rotate(-25 38 32)" />

      {/* 翅膀 */}
      <path d="M18 58 C10 56 9 66 17 70 C21 71 24 66 22 61 Z" fill="#f5b81c" />
      <path d="M82 58 C90 56 91 66 83 70 C79 71 76 66 78 61 Z" fill="#f5b81c" />

      {/* 眼睛 */}
      {mood === 'happy' && (
        <g stroke="#3b2a1a" strokeWidth="3" strokeLinecap="round" fill="none">
          <path d="M34 47 q5 -6 10 0" />
          <path d="M56 47 q5 -6 10 0" />
        </g>
      )}
      {mood === 'sleepy' && (
        <g stroke="#3b2a1a" strokeWidth="3" strokeLinecap="round" fill="none">
          <path d="M34 46 q5 4 10 0" />
          <path d="M56 46 q5 4 10 0" />
        </g>
      )}
      {(mood === 'smile' || mood === 'wow') && (
        <g>
          <ellipse cx="39" cy="46" rx="4.2" ry={mood === 'wow' ? 5.5 : 4.8} fill="#3b2a1a" />
          <ellipse cx="61" cy="46" rx="4.2" ry={mood === 'wow' ? 5.5 : 4.8} fill="#3b2a1a" />
          <circle cx="40.5" cy="44" r="1.5" fill="#fff" />
          <circle cx="62.5" cy="44" r="1.5" fill="#fff" />
        </g>
      )}

      {/* 腮紅 */}
      <ellipse cx="30" cy="56" rx="5" ry="3" fill="#ff8a80" opacity="0.55" />
      <ellipse cx="70" cy="56" rx="5" ry="3" fill="#ff8a80" opacity="0.55" />

      {/* 嘴巴 */}
      {mood === 'wow' ? (
        <ellipse cx="50" cy="57" rx="4" ry="4.5" fill="#f08c1a" />
      ) : (
        <path d="M44 53 L50 50 L56 53 L50 59 Z" fill="#f08c1a" stroke="#e07a10" strokeWidth="1" strokeLinejoin="round" />
      )}

      {/* 廚師帽 */}
      {hat && (
        <g>
          <path
            d="M34 24 C28 22 28 12 36 12 C37 5 47 3 51 9 C55 3 65 5 65 12 C73 12 73 22 66 24 Z"
            fill="#fff"
            stroke="#e7dccb"
            strokeWidth="1.5"
          />
          <rect x="34" y="22" width="32" height="7" rx="2" fill="#fff" stroke="#e7dccb" strokeWidth="1.5" />
        </g>
      )}
    </svg>
  );
}
