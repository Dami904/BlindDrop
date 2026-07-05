"use client";

/** Sort order shared by both Campaigns-page sections and the toolbar. */
export type CampaignSort = "newest" | "oldest" | "status";

const SORT_OPTIONS: { value: CampaignSort; label: string }[] = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "status", label: "Status" },
];

/**
 * Search + sort toolbar for the Campaigns page — one control pair driving
 * both the airdrop-campaigns and disperse-history sections. Wraps on narrow
 * viewports (never a nowrap row) so it can't overflow at 375px.
 */
export function CampaignsToolbar({
  query,
  onQueryChange,
  sort,
  onSortChange,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  sort: CampaignSort;
  onSortChange: (value: CampaignSort) => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="min-w-0 flex-1" style={{ minWidth: "12rem" }}>
        <label htmlFor="campaigns-search" className="label">
          Search
        </label>
        <input
          id="campaigns-search"
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Nickname, address, or token…"
          className="field mt-1"
          autoComplete="off"
        />
      </div>
      <div className="min-w-0">
        <label htmlFor="campaigns-sort" className="label">
          Sort
        </label>
        <select
          id="campaigns-sort"
          value={sort}
          onChange={(e) => onSortChange(e.target.value as CampaignSort)}
          className="field mt-1"
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
