/** Gold coins (the wallet and its rules live on the server, see lib/coins.ts): how much one finished task earns. */
export const COINS_PER_TASK = 10;

/** A gold coin: a warm gradient face, a lighter rim and an embossed star. */
export function GoldCoin({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} aria-hidden>
      <defs>
        <linearGradient id="gc-face" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FFE680" />
          <stop offset="0.5" stopColor="#F7C531" />
          <stop offset="1" stopColor="#D99A0B" />
        </linearGradient>
        <linearGradient id="gc-rim" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FFF3B8" />
          <stop offset="1" stopColor="#B87A05" />
        </linearGradient>
      </defs>
      <circle cx="12" cy="12" r="11" fill="url(#gc-rim)" />
      <circle cx="12" cy="12" r="9" fill="url(#gc-face)" />
      <circle cx="12" cy="12" r="7.2" fill="none" stroke="#C98A06" strokeOpacity="0.45" strokeWidth="0.8" />
      <path d="M12 7.2l1.35 2.85 3.1.38-2.28 2.13.6 3.07L12 14.1l-2.77 1.53.6-3.07-2.28-2.13 3.1-.38z" fill="#FFF6CC" stroke="#B87A05" strokeOpacity="0.5" strokeWidth="0.5" strokeLinejoin="round" />
    </svg>
  );
}
