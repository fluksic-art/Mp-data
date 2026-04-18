"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Area,
  AreaChart,
} from "recharts";

const CHART_COLORS = [
  "oklch(0.55 0.18 250)",
  "oklch(0.65 0.15 160)",
  "oklch(0.70 0.18 60)",
  "oklch(0.60 0.20 20)",
  "oklch(0.55 0.18 320)",
  "oklch(0.70 0.12 200)",
  "oklch(0.60 0.15 100)",
];

const AXIS_STYLE = {
  fontSize: 11,
  fill: "var(--muted-foreground)",
};

const TOOLTIP_STYLE = {
  backgroundColor: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: "6px",
  fontSize: "12px",
  padding: "6px 10px",
};

export function HorizontalBarChart({
  data,
  dataKey,
  labelKey,
  height = 300,
  color = CHART_COLORS[0],
}: {
  data: Array<Record<string, unknown>>;
  dataKey: string;
  labelKey: string;
  height?: number;
  color?: string;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ left: 10, right: 20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
        <XAxis type="number" tick={AXIS_STYLE} />
        <YAxis
          type="category"
          dataKey={labelKey}
          tick={AXIS_STYLE}
          width={120}
        />
        <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "var(--muted)" }} />
        <Bar dataKey={dataKey} fill={color} radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function GroupedBarChart({
  data,
  keys,
  labelKey,
  height = 300,
}: {
  data: Array<Record<string, unknown>>;
  keys: string[];
  labelKey: string;
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ left: 10, right: 20, top: 10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey={labelKey} tick={AXIS_STYLE} />
        <YAxis tick={AXIS_STYLE} />
        <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "var(--muted)" }} />
        <Legend wrapperStyle={{ fontSize: "11px" }} />
        {keys.map((k, i) => (
          <Bar key={k} dataKey={k} fill={CHART_COLORS[i % CHART_COLORS.length]} radius={[4, 4, 0, 0]} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function StackedBarChart({
  data,
  keys,
  labelKey,
  height = 300,
}: {
  data: Array<Record<string, unknown>>;
  keys: string[];
  labelKey: string;
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ left: 10, right: 20, top: 10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey={labelKey} tick={AXIS_STYLE} />
        <YAxis tick={AXIS_STYLE} />
        <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "var(--muted)" }} />
        <Legend wrapperStyle={{ fontSize: "11px" }} />
        {keys.map((k, i) => (
          <Bar
            key={k}
            dataKey={k}
            stackId="a"
            fill={CHART_COLORS[i % CHART_COLORS.length]}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function HistogramChart({
  data,
  dataKey,
  labelKey,
  height = 260,
}: {
  data: Array<Record<string, unknown>>;
  dataKey: string;
  labelKey: string;
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ left: 10, right: 20, top: 10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey={labelKey} tick={AXIS_STYLE} angle={-20} textAnchor="end" height={50} />
        <YAxis tick={AXIS_STYLE} />
        <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "var(--muted)" }} />
        <Bar dataKey={dataKey} fill={CHART_COLORS[0]} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function DonutChart({
  data,
  dataKey,
  labelKey,
  height = 280,
}: {
  data: Array<Record<string, unknown>>;
  dataKey: string;
  labelKey: string;
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Tooltip contentStyle={TOOLTIP_STYLE} />
        <Legend wrapperStyle={{ fontSize: "11px" }} />
        <Pie
          data={data}
          dataKey={dataKey}
          nameKey={labelKey}
          cx="50%"
          cy="50%"
          innerRadius={60}
          outerRadius={95}
          paddingAngle={2}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
          ))}
        </Pie>
      </PieChart>
    </ResponsiveContainer>
  );
}

export function PriceChangeChart({
  data,
  height = 280,
}: {
  data: Array<{ week: string; increases: number; decreases: number; avgPct: number }>;
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ left: 10, right: 20, top: 10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="week" tick={AXIS_STYLE} />
        <YAxis yAxisId="left" tick={AXIS_STYLE} />
        <YAxis yAxisId="right" orientation="right" tick={AXIS_STYLE} unit="%" />
        <Tooltip contentStyle={TOOLTIP_STYLE} />
        <Legend wrapperStyle={{ fontSize: "11px" }} />
        <Bar yAxisId="left" dataKey="increases" fill={CHART_COLORS[1]} name="Aumentos" radius={[4, 4, 0, 0]} />
        <Bar yAxisId="left" dataKey="decreases" fill={CHART_COLORS[3]} name="Bajas" radius={[4, 4, 0, 0]} />
        <Line yAxisId="right" type="monotone" dataKey="avgPct" stroke={CHART_COLORS[0]} name="% Cambio promedio" strokeWidth={2} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function StackedAreaChart({
  data,
  keys,
  labelKey,
  height = 280,
}: {
  data: Array<Record<string, unknown>>;
  keys: string[];
  labelKey: string;
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ left: 10, right: 20, top: 10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey={labelKey} tick={AXIS_STYLE} />
        <YAxis tick={AXIS_STYLE} />
        <Tooltip contentStyle={TOOLTIP_STYLE} />
        <Legend wrapperStyle={{ fontSize: "11px" }} />
        {keys.map((k, i) => (
          <Area
            key={k}
            type="monotone"
            dataKey={k}
            stackId="1"
            stroke={CHART_COLORS[i % CHART_COLORS.length]}
            fill={CHART_COLORS[i % CHART_COLORS.length]}
            fillOpacity={0.7}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function PriceRangeBarChart({
  data,
  height = 280,
}: {
  data: Array<{ type: string; min: number; q1: number; median: number; q3: number; max: number }>;
  height?: number;
}) {
  const transformed = data.map((d) => ({
    type: d.type,
    baseQ1: d.q1,
    iqr: d.q3 - d.q1,
    median: d.median,
    whiskerLow: d.q1 - d.min,
    whiskerHigh: d.max - d.q3,
  }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={transformed} layout="vertical" margin={{ left: 10, right: 20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
        <XAxis type="number" tick={AXIS_STYLE} tickFormatter={(v) => `${(v / 1000000).toFixed(1)}M`} />
        <YAxis type="category" dataKey="type" tick={AXIS_STYLE} width={100} />
        <Tooltip contentStyle={TOOLTIP_STYLE} />
        <Bar dataKey="baseQ1" stackId="a" fill="transparent" />
        <Bar dataKey="iqr" stackId="a" fill={CHART_COLORS[0]} radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
