import type { ReactNode } from "react";

export interface SpecRow {
  label: string;
  value: ReactNode | null | undefined;
}

// Rows with no value are skipped so e.g. an EV doesn't show empty "Cylinders" or "MPG" lines.
export default function SpecSection({ title, rows }: { title: string; rows: SpecRow[] }) {
  const visibleRows = rows.filter((row) => row.value !== null && row.value !== undefined && row.value !== "");
  if (visibleRows.length === 0) return null;

  return (
    <section className="card bg-base-100 shadow-sm border-solid border-1 border-violet-200">
      <div className="card-body">
        <h2 className="card-title">{title}</h2>
        <dl className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
          {visibleRows.map((row) => (
            <div key={row.label} className="flex justify-between gap-4 border-b border-base-content/10 py-2">
              <dt className="text-base-content/70">{row.label}</dt>
              <dd className="text-right font-medium">{row.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
