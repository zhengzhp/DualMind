export function Placeholder({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-brand-100 bg-white/60 p-6 text-center">
      <h2 className="text-sm font-semibold text-brand-900">{title}</h2>
      <p className="mt-2 text-xs leading-relaxed text-brand-700/70">{desc}</p>
    </div>
  );
}
