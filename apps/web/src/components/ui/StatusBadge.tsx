const STATUS_STYLES: Record<string, string> = {
  PUBLISHED: "bg-emerald-500/15 text-emerald-700 border-emerald-200/60",
  PARTIALLY_PUBLISHED: "bg-teal-500/15 text-teal-700 border-teal-200/60",
  READY: "bg-brand-500/15 text-brand-700 border-brand-200/60",
  PUBLISHING: "bg-violet-500/15 text-violet-700 border-violet-200/60",
  PROCESSING: "bg-amber-500/15 text-amber-700 border-amber-200/60",
  RECEIVED: "bg-slate-500/15 text-slate-600 border-slate-200/60",
  APPROVED: "bg-indigo-500/15 text-indigo-700 border-indigo-200/60",
  FAILED: "bg-rose-500/15 text-rose-700 border-rose-200/60",
};

const PULSE_STATUSES = new Set(["READY", "PUBLISHING", "PROCESSING", "RECEIVED"]);

export function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.RECEIVED;
  const pulse = PULSE_STATUSES.has(status);

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${style}`}
    >
      {pulse && (
        <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
      )}
      {status === "PUBLISHED" && <span className="text-emerald-500">✓</span>}
      {status.replace(/_/g, " ")}
    </span>
  );
}
