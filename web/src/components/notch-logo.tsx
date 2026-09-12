export function NotchLogo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={className}
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M4 4 H12 L16 13 L20 4 H28 V28 H4 Z" />
    </svg>
  );
}
