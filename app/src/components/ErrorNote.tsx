export interface ErrorNoteProps {
  /** Plain-language headline — what happened, and what to do next. */
  message: string;
  /** Raw underlying error (SDK/viem message, on-chain revert name, etc.), shown
   * only inside a collapsed disclosure so debugging info isn't lost but never
   * leads with jargon. Omitted entirely when it would just repeat `message`. */
  detail?: string;
  className?: string;
}

/**
 * One consistent shape for every error callout in the app: a friendly
 * headline up top, with the raw error (if any, and if it adds information)
 * tucked behind a "Technical details" disclosure.
 */
export function ErrorNote({ message, detail, className = "" }: ErrorNoteProps) {
  const showDetail = !!detail && detail.trim().length > 0 && detail.trim() !== message.trim();
  return (
    <div className={`callout callout-err callout-col ${className}`}>
      <span>{message}</span>
      {showDetail && (
        <details className="mt-1">
          <summary className="cursor-pointer text-xs" style={{ color: "var(--text-faint)" }}>
            Technical details
          </summary>
          <p className="font-data mt-1 text-xs break-all" style={{ color: "var(--text-faint)" }}>
            {detail}
          </p>
        </details>
      )}
    </div>
  );
}
