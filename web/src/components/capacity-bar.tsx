"use client";

/**
 * The signature element (Appendix E): a bar that fills as capacity is financed and cuts
 * a notch at each draw boundary. Motion happens once, on settle -- CSS transition on
 * width, respecting prefers-reduced-motion via globals.css's blanket override.
 */
export function CapacityBar({ capacity, draws, financed }: { capacity: bigint; draws: bigint[]; financed?: bigint }) {
  if (capacity === 0n) return null;

  const boundaries = draws.reduce<{ pct: number; running: bigint }[]>((acc, amount) => {
    const running = (acc.length > 0 ? acc[acc.length - 1].running : 0n) + amount;
    acc.push({ pct: Number((running * 10000n) / capacity) / 100, running });
    return acc;
  }, []).map((b) => b.pct);
  const filledPct = financed !== undefined ? Number(financed * 10000n / capacity) / 100 : boundaries.length > 0 ? boundaries[boundaries.length - 1] : 0;

  return (
    <div className="relative h-4 w-full rounded-sm border border-line bg-bone overflow-hidden">
      <div
        className="absolute inset-y-0 left-0 bg-ink transition-[width] duration-700 ease-out"
        style={{ width: `${filledPct}%` }}
      />
      {boundaries.slice(0, -1).map((pct, i) => (
        <div
          key={i}
          className="absolute inset-y-0 w-[2px] bg-bone"
          style={{ left: `${pct}%` }}
          aria-hidden="true"
        />
      ))}
      {filledPct > 0 && (
        <div
          className="absolute inset-y-0 w-[3px] bg-cut"
          style={{ left: `calc(${filledPct}% - 1.5px)` }}
          aria-hidden="true"
          title="Notch: the most recent draw"
        />
      )}
    </div>
  );
}
