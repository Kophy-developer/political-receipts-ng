import type { ChartSpec } from "@/lib/research/series";

export function SeriesChart({ chart }: { chart: ChartSpec }) {
  const width = 640;
  const height = 220;
  const pad = 28;
  const values = chart.points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const coords = chart.points.map((point, index) => {
    const x = pad + (index * (width - pad * 2)) / Math.max(chart.points.length - 1, 1);
    const y = height - pad - ((point.value - min) / span) * (height - pad * 2);
    return { ...point, x, y };
  });
  const line = coords.map((point) => `${point.x},${point.y}`).join(" ");
  return (
    <figure className="mt-3">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" className="w-full border border-rule bg-paper" aria-label={`${chart.metric}, ${chart.unit}, ${chart.period}`}>
        <title>{chart.metric}, {chart.unit}, {chart.period}</title>
        <polyline fill="none" stroke="currentColor" strokeWidth="2" points={line} />
        {coords.map((point) => <circle key={point.year} cx={point.x} cy={point.y} r="3" fill="currentColor" />)}
        {coords.map((point) => <text key={`${point.year}-label`} x={point.x} y={height - 8} textAnchor="middle" fontSize="11">{point.year}</text>)}
      </svg>
      <figcaption className="mt-2 space-y-1 text-sm text-ink-soft">
        <p>{chart.metric} · {chart.unit} · {chart.period}</p>
        <p>Source: {chart.source}{chart.url ? ` · ${chart.url}` : ""}</p>
        {chart.limitations.slice(0, 3).map((item) => <p key={item}>{item}</p>)}
        <p>This chart is not attached to a post. Publishing it needs a separate decision.</p>
      </figcaption>
    </figure>
  );
}
