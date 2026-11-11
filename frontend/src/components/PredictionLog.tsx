import type { ModelsResponse, StatsResponse } from "../lib/api";
import { pct } from "../lib/api";
import type { Async } from "./ResultPanel";

const timeAgo = (iso: string) => {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
};

export function PredictionLog({
  stats,
  models,
  onRetry,
}: {
  stats: Async<StatsResponse>;
  models: Async<ModelsResponse>;
  onRetry: () => void;
}) {
  const name = (id: string) =>
    (models.state === "done" && models.data.models.find((m) => m.id === id)?.name) || id;

  return (
    <section id="log" aria-labelledby="log-title" className="card p-5 sm:p-6">
      <p className="eyebrow">Stored in Postgres</p>
      <h2 id="log-title" className="font-display text-2xl font-semibold">
        Prediction log
      </h2>
      <p className="mt-1 text-sm text-ink-muted">
        Every prediction is recorded anonymously (measurements and result only). Includes demo seed
        data.
      </p>

      {stats.state === "error" ? (
        <div role="alert" className="mt-4 rounded-[var(--radius-md)] bg-sunken p-4 text-sm">
          <p className="font-medium">History is unavailable right now</p>
          <p className="mt-1 text-ink-muted">{stats.message} Predictions still work.</p>
          <button type="button" className="btn btn-ghost mt-3 text-sm" onClick={onRetry}>
            Try again
          </button>
        </div>
      ) : stats.state !== "done" ? (
        <div className="mt-5 space-y-3" aria-label="Loading prediction log">
          <div className="grid grid-cols-3 gap-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="skeleton h-16" />
            ))}
          </div>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-9" />
          ))}
        </div>
      ) : stats.data.total === 0 ? (
        <p className="mt-5 rounded-[var(--radius-md)] bg-sunken p-4 text-sm text-ink-muted">
          No predictions yet. Run one above and it will appear here.
        </p>
      ) : (
        <>
          <dl className="mt-5 grid grid-cols-3 gap-3">
            <Stat label="Total" value={stats.data.total.toLocaleString()} />
            <Stat label="Malignant" value={pct(stats.data.malignant / stats.data.total, 0)} />
            <Stat label="Last 24 h" value={stats.data.last_24h.toLocaleString()} />
          </dl>
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[20rem] text-left text-sm">
              <caption className="sr-only">Most recent predictions</caption>
              <thead className="text-xs text-ink-muted">
                <tr className="border-b border-line">
                  <th scope="col" className="py-2 pr-3 font-medium">
                    #
                  </th>
                  <th scope="col" className="py-2 pr-3 font-medium">
                    Model
                  </th>
                  <th scope="col" className="py-2 pr-3 font-medium">
                    Result
                  </th>
                  <th scope="col" className="py-2 text-right font-medium">
                    When
                  </th>
                </tr>
              </thead>
              <tbody>
                {stats.data.recent.map((r) => (
                  <tr key={r.id} className="border-b border-line last:border-0">
                    <td className="py-2.5 pr-3 font-mono text-ink-muted tabular-nums">{r.id}</td>
                    <td className="max-w-[10rem] truncate py-2.5 pr-3">{name(r.model_id)}</td>
                    <td
                      className={`py-2.5 pr-3 font-medium ${r.label ? "text-malignant" : "text-benign"}`}
                    >
                      {r.label ? "Malignant" : "Benign"}
                      {r.probability_malignant !== null && (
                        <span className="font-mono font-normal tabular-nums text-ink-muted">
                          {" "}
                          {pct(r.probability_malignant, 0)}
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 text-right whitespace-nowrap text-ink-muted">
                      {timeAgo(r.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--radius-md)] bg-sunken px-3 py-3">
      <dt className="text-xs text-ink-muted">{label}</dt>
      <dd className="mt-0.5 font-mono text-xl font-medium tabular-nums">{value}</dd>
    </div>
  );
}
