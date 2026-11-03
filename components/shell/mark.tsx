export function ReceiptMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={className}>
      <path
        fill="currentColor"
        d="M7 4.2h18v23.2l-2.25-1.5-2.25 1.5-2.25-1.5L16 27.4l-2.25-1.5-2.25 1.5-2.25-1.5L7 27.4V4.2z"
      />
      <path
        d="M11 11.5h10M11 16h10M11 20.5h6"
        stroke="#9f2d20"
        strokeWidth="1.4"
        fill="none"
      />
    </svg>
  );
}
