export function Placeholder({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="rounded-card border border-dashed border-line bg-surface p-6 text-center">
      <h2 className="text-body font-semibold text-ink">{title}</h2>
      <p className="mt-2 text-meta leading-relaxed text-ink-2">{desc}</p>
    </div>
  );
}
