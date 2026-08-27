export function LoadingSpinner({ label = "Loading..." }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[320px] gap-4">
      <div className="relative">
        <div className="w-14 h-14 rounded-full border-2 border-brand-100" />
        <div className="absolute inset-0 w-14 h-14 rounded-full border-2 border-transparent border-t-brand-600 animate-spin" />
        <div className="absolute inset-2 w-10 h-10 rounded-full bg-gradient-to-br from-brand-500/20 to-violet-500/20 animate-pulse" />
      </div>
      <p className="text-sm font-medium text-slate-500">{label}</p>
    </div>
  );
}
