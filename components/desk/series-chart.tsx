import { chartScale, formatInvestment } from "@/lib/editorial/money";
import type { ChartSpec } from "@/lib/research/series";

export function SeriesChart({ chart }: { chart: ChartSpec }) {
  const width = 720;
  const height = 280;
  const padLeft = 64;
  const padRight = 18;
  const padTop = 18;
  const padBottom = 36;
  const scale = chartScale(chart.points.map((point) => point.value));
  const span = scale.max - scale.min || 1;
  const plotWidth = width - padLeft - padRight;
  const plotHeight = height - padTop - padBottom;
  const yFor = (value: number) => padTop + ((scale.max - value) / span) * plotHeight;
  const coords = chart.points.map((point, index) => {
    const x = padLeft + (index * plotWidth) / Math.max(chart.points.length - 1, 1);
    return { ...point, x, y: yFor(point.value) };
  });
  const line = coords.map((point) => `${point.x},${point.y}`).join(" ");
  const ticks = [scale.dataMin, 0, scale.dataMax].filter((value, index, all) => all.indexOf(value) === index).sort((left, right) => left - right);
  const negativeYears = chart.points.filter((point) => point.value < 0).map((point) => point.year);
  const alt = `${chart.metric}, ${chart.period}, in ${chart.unit}. The scale includes ${formatInvestment(scale.dataMin, chart.unit)} to ${formatInvestment(scale.dataMax, chart.unit)}.${negativeYears.length ? ` Negative in ${negativeYears.join(", ")}.` : ""} Source: ${chart.source}.`;
  return (
    <figure className="mt-3">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" className="w-full border border-rule bg-paper" aria-label={alt}>
        <title>{alt}</title>
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={padLeft} x2={width - padRight} y1={yFor(tick)} y2={yFor(tick)} stroke="currentColor" strokeOpacity={tick === 0 ? 0.45 : 0.15} />
            <text x={padLeft - 8} y={yFor(tick) + 4} textAnchor="end" fontSize="11">{formatInvestment(tick, chart.unit).replace("bn", "")}</text>
          </g>
        ))}
        <text x={padLeft} y={12} fontSize="11">USD billions</text>
        <polyline fill="none" stroke="currentColor" strokeWidth="2" points={line} />
        {coords.map((point) => <circle key={point.year} cx={point.x} cy={point.y} r="3.5" fill="currentColor" />)}
        {coords.map((point) => <text key={`${point.year}-label`} x={point.x} y={height - 12} textAnchor="middle" fontSize="11">{point.year}</text>)}
      </svg>
      <figcaption className="mt-2 space-y-2 text-sm text-ink-soft">
        <p>{chart.metric}. {chart.unit}. {chart.period}. Source: {chart.source}{chart.url ? `. ${chart.url}` : ""}.</p>
        <p>The axis is in USD billions. Negative values stay on the scale.{negativeYears.length ? ` ${negativeYears.join(", ")} ${negativeYears.length === 1 ? "is" : "are"} below zero.` : ""}</p>
        <table className="w-full border-collapse text-left text-sm text-ink">
          <caption className="sr-only">{alt}</caption>
          <thead>
            <tr className="border-b border-rule">
              <th className="py-1 font-normal">Year</th>
              <th className="py-1 font-normal">USD billions</th>
              <th className="py-1 font-normal">Exact value</th>
            </tr>
          </thead>
          <tbody>
            {chart.points.map((point) => (
              <tr key={point.year} className="border-b border-rule">
                <td className="py-1">{point.year}</td>
                <td className="py-1">{formatInvestment(point.value, chart.unit)}</td>
                <td className="py-1">{point.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p>This chart is not attached to a post. Publishing it needs a separate decision.</p>
      </figcaption>
    </figure>
  );
}
