const STATUS_STYLES: Record<string, string> = {
  PUBLISHED: "bg-electric-emerald/10 text-electric-emerald border-electric-emerald/20 shadow-[0_0_10px_rgba(0,255,163,0.1)]",
  PARTIALLY_PUBLISHED: "bg-teal-500/10 text-teal-400 border-teal-500/20",
  READY: "bg-electric-cyan/10 text-electric-cyan border-electric-cyan/20 shadow-[0_0_10px_rgba(0,240,255,0.1)]",
  PUBLISHING: "bg-electric-magenta/10 text-electric-magenta border-electric-magenta/20 shadow-[0_0_10px_rgba(255,0,229,0.1)]",
  PROCESSING: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  RECEIVED: "bg-slate-500/10 text-slate-400 border-slate-500/20",
  APPROVED: "bg-brand-500/10 text-brand-400 border-brand-500/20",
  FAILED: "bg-red-500/10 text-red-400 border-red-500/20 shadow-[0_0_10px_rgba(239,68,68,0.1)]",
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
