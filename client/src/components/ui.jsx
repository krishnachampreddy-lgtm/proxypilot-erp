export function Card({ title, subtitle, right, children, className = '' }) {
  return (
    <section className={`glass min-w-0 rounded-[14px] p-5 shadow-[0_18px_40px_-24px_rgba(0,0,0,0.7)] ${className}`}>
      {(title || right) && (
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-[1.45rem] leading-tight text-ink">{title}</h2>
            {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
          </div>
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

const STATUS = {
  accepted: ['Covered', 'bg-sage-soft text-sage'],
  pending: ['Awaiting reply', 'bg-brass-soft text-brass-2'],
  uncovered: ['Not covered', 'bg-clay-soft text-clay'],
};

export function StatusBadge({ status }) {
  const [label, cls] = STATUS[status] || [status, 'bg-paper-2 text-ink'];
  return <span className={`inline-block rounded px-2 py-0.5 font-mono text-[11px] font-medium uppercase tracking-wide ${cls}`}>{label}</span>;
}

export function ErrorBox({ text }) {
  if (!text) return null;
  return <div className="rounded-md border border-clay/30 bg-clay-soft px-3 py-2 text-sm text-clay">{text}</div>;
}

export function Empty({ children }) {
  return <p className="rounded-md border border-dashed border-line px-4 py-6 text-center text-sm text-muted">{children}</p>;
}

export function Button({ variant = 'primary', className = '', ...props }) {
  const styles = {
    primary: 'bg-ink text-paper hover:bg-ink-3 disabled:bg-ink/40',
    success: 'bg-sage text-paper hover:bg-sage/90 disabled:bg-sage/40',
    brass: 'bg-brass text-paper hover:brightness-110 disabled:opacity-50',
    ghost: 'border border-line bg-white text-ink hover:border-brass/60 disabled:opacity-50',
  };
  return <button className={`rounded-[11px] px-4 py-2 text-sm font-semibold transition ${styles[variant]} ${className}`} {...props} />;
}
