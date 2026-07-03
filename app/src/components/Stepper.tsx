export interface StepDef {
  label: string;
  state: "idle" | "active" | "done";
}

/**
 * Horizontal stage stepper reusing the `.seal-badge` wax-seal marker from
 * the create wizard. Purely presentational — callers derive `state` from
 * whatever state they already own (packet loaded, claim success, etc.).
 */
export function Stepper({ steps }: { steps: StepDef[] }) {
  return (
    <ol className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
      {steps.map((s, i) => (
        <li key={s.label} className="flex items-center gap-3">
          <span className="seal-badge" data-state={s.state === "idle" ? undefined : s.state}>
            {s.state === "done" ? "✓" : i + 1}
          </span>
          <span
            className="font-data text-xs tracking-wide uppercase"
            style={{
              color:
                s.state === "active"
                  ? "var(--gold)"
                  : s.state === "done"
                    ? "var(--text-dim)"
                    : "var(--text-faint)",
            }}
          >
            {s.label}
          </span>
          {i < steps.length - 1 && (
            <span aria-hidden style={{ color: "var(--text-faint)" }}>
              ···
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}
