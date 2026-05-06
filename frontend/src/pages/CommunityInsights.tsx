import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '@/lib/api';
import { CommunityPageHeader } from '@/components/community/CommunityPageHeader';
import { InsightsToolbar, presetToRange, type DatePresetId } from '@/components/community/insights/InsightsToolbar';
import { InsightsKpiCard } from '@/components/community/insights/InsightsKpiCard';
import { InsightsActivityTimeline } from '@/components/community/insights/InsightsActivityTimeline';
import { InsightsEngagementByArea } from '@/components/community/insights/InsightsEngagementByArea';
import { InsightsEngagementByPriority } from '@/components/community/insights/InsightsEngagementByPriority';
import { InsightsTopPosts } from '@/components/community/insights/InsightsTopPosts';
import { InsightsTopContributors } from '@/components/community/insights/InsightsTopContributors';
import { InsightsReadHealth } from '@/components/community/insights/InsightsReadHealth';
import { InsightsWorkforceReach } from '@/components/community/insights/InsightsWorkforceReach';
import { computeDelta, type InsightsPayload } from '@/components/community/insights/insightsTypes';

const DEFAULT_PRESET: DatePresetId = '14d';

function presetForRange(from: string, to: string): DatePresetId {
  const candidates: DatePresetId[] = ['7d', '14d', '30d', '90d', 'qtd'];
  for (const id of candidates) {
    const r = presetToRange(id);
    if (r.from === from && r.to === to) return id;
  }
  return 'custom';
}

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function buildCsv(payload: InsightsPayload): string {
  const lines: string[] = [];
  lines.push(`Community Insights export`);
  lines.push(`Range,${csvEscape(payload.range.from)}->${csvEscape(payload.range.to)} (${payload.range.days} days)`);
  lines.push('');
  lines.push('Headline KPIs');
  lines.push('Metric,Current,Previous');
  const k = payload.kpis;
  const p = payload.previous;
  lines.push(`Posts Published,${k.posts_published},${p.posts_published}`);
  lines.push(`Total Views,${k.post_views},${p.post_views}`);
  lines.push(`Active Members,${k.active_members},${p.active_members}`);
  lines.push(`Comments Made,${k.comments_made},${p.comments_made}`);
  lines.push(`Likes Total,${k.likes_total},${p.likes_total}`);
  lines.push(`Engagement Rate (%),${k.engagement_rate_pct},${p.engagement_rate_pct}`);
  lines.push(`Avg Read Rate (%),${k.avg_read_rate_pct},${p.avg_read_rate_pct}`);
  lines.push('');
  lines.push('Top posts');
  lines.push('Title,Author,Area,Priority,Views,Likes,Comments,Audience,Read %');
  for (const tp of payload.top_posts) {
    lines.push([
      csvEscape(tp.title),
      csvEscape(tp.author_name),
      csvEscape(tp.related_area),
      csvEscape(tp.priority),
      tp.views,
      tp.likes,
      tp.comments,
      tp.audience,
      tp.read_rate_pct,
    ].join(','));
  }
  lines.push('');
  lines.push('Top contributors');
  lines.push('User,Posts,Views,Likes,Comments,Engagement');
  for (const c of payload.top_contributors) {
    lines.push([
      csvEscape(c.user_name),
      c.posts_count,
      c.views_total,
      c.likes_total,
      c.comments_total,
      c.engagement_score,
    ].join(','));
  }
  return lines.join('\n');
}

function downloadCsv(filename: string, contents: string) {
  const blob = new Blob([contents], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function KpiSkeleton() {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm min-w-0 w-full flex flex-col gap-2">
      <div className="space-y-1.5">
        <div className="h-3 w-24 max-w-full bg-gray-100 rounded animate-pulse" />
        <div className="h-5 w-28 max-w-full bg-gray-100 rounded animate-pulse" />
      </div>
      <div className="h-8 w-20 bg-gray-100 rounded animate-pulse" />
      <div className="h-8 w-full min-w-0 bg-gray-50 rounded animate-pulse" />
    </div>
  );
}

function SectionSkeleton({ height = 240 }: { height?: number }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-4">
      <div className="h-4 w-40 bg-gray-100 rounded animate-pulse mb-3" />
      <div className="bg-gray-50 rounded animate-pulse" style={{ height }} />
    </div>
  );
}

export default function CommunityInsights() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const initialFrom = searchParams.get('from');
  const initialTo = searchParams.get('to');
  const initialPreset = (searchParams.get('preset') as DatePresetId | null) ?? null;

  const [{ from, to, preset }, setRangeState] = useState(() => {
    if (initialFrom && initialTo) {
      const detected = initialPreset ?? presetForRange(initialFrom, initialTo);
      return { from: initialFrom, to: initialTo, preset: detected };
    }
    const r = presetToRange(DEFAULT_PRESET);
    return { from: r.from, to: r.to, preset: DEFAULT_PRESET };
  });

  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    next.set('from', from);
    next.set('to', to);
    next.set('preset', preset);
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, preset]);

  function handlePresetChange(p: DatePresetId) {
    if (p === 'custom') {
      setRangeState({ from, to, preset: 'custom' });
    } else {
      const r = presetToRange(p);
      setRangeState({ from: r.from, to: r.to, preset: p });
    }
  }

  function handleDateFromChange(v: string) {
    if (!v) return;
    setRangeState({ from: v, to, preset: 'custom' });
  }
  function handleDateToChange(v: string) {
    if (!v) return;
    setRangeState({ from, to: v, preset: 'custom' });
  }

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['community-insights', from, to],
    queryFn: () => api<InsightsPayload>('GET', `/community/insights?from=${from}&to=${to}`),
  });

  const insights = data;

  const deltas = useMemo(() => {
    if (!insights) return null;
    const k = insights.kpis;
    const p = insights.previous;
    return {
      posts: computeDelta(k.posts_published, p.posts_published),
      views: computeDelta(k.post_views, p.post_views),
      active: computeDelta(k.active_members, p.active_members),
      engagement: computeDelta(k.engagement_rate_pct, p.engagement_rate_pct),
      readRate: computeDelta(k.avg_read_rate_pct, p.avg_read_rate_pct),
    };
  }, [insights]);

  const handleExport = () => {
    if (!insights) return;
    const csv = buildCsv(insights);
    downloadCsv(`community-insights-${from}-to-${to}.csv`, csv);
  };

  return (
    <div className="space-y-4 min-w-0 max-w-full">
      <div className="min-w-0 max-w-full">
        <CommunityPageHeader
          title="Insights"
          subtitle="Analytics and engagement metrics for the selected window."
          onBack={() => navigate('/community')}
        />
      </div>

      <InsightsToolbar
        preset={preset}
        onPresetChange={handlePresetChange}
        dateFrom={from}
        dateTo={to}
        onDateFromChange={handleDateFromChange}
        onDateToChange={handleDateToChange}
        onExport={handleExport}
        isExporting={!insights}
        onRefresh={() => { void refetch(); }}
        isRefreshing={isFetching}
      />

      {isError ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 text-rose-800 p-4 text-sm">
          <div className="font-semibold mb-1">Unable to load insights</div>
          <div className="text-xs">
            You need <code className="font-mono">hr:community:write</code> permission to access this page.
          </div>
          {error instanceof Error ? <div className="text-xs mt-1 text-rose-700/80">{error.message}</div> : null}
        </div>
      ) : null}

      {/* Hero KPI Strip — auto-fit keeps each card ≥260px wide so chips/sparklines never collide */}
      <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr))]">
        {isLoading || !insights || !deltas ? (
          Array.from({ length: 5 }).map((_, i) => <KpiSkeleton key={i} />)
        ) : (
          <>
            <InsightsKpiCard
              label="Posts Published"
              value={insights.kpis.posts_published}
              deltaPct={deltas.posts.pct}
              sparkline={insights.daily.posts_published}
              sparklineColor="#0f766e"
              sparklineFill="rgba(15, 118, 110, 0.12)"
              hint={`${insights.previous.posts_published} in previous window`}
            />
            <InsightsKpiCard
              label="Total Views"
              value={insights.kpis.post_views}
              deltaPct={deltas.views.pct}
              sparkline={insights.daily.views}
              sparklineColor="#1d4ed8"
              sparklineFill="rgba(29, 78, 216, 0.12)"
              hint={`${insights.previous.post_views.toLocaleString()} in previous window`}
            />
            <InsightsKpiCard
              label="Active Members"
              value={insights.kpis.active_members}
              deltaPct={deltas.active.pct}
              sparkline={insights.daily.active_users}
              sparklineColor="#a16207"
              sparklineFill="rgba(161, 98, 7, 0.12)"
              hint={`${insights.workforce_reach.active_percentage.toFixed(1)}% of workforce`}
            />
            <InsightsKpiCard
              label="Engagement Rate"
              value={insights.kpis.engagement_rate_pct}
              unit="%"
              formatter={(v) => v.toFixed(1)}
              deltaPct={deltas.engagement.pct}
              sparklineColor="#d11616"
              sparklineFill="rgba(209, 22, 22, 0.12)"
              hint="(likes + comments) / views"
            />
            <InsightsKpiCard
              label="Avg Read Rate"
              value={insights.kpis.avg_read_rate_pct}
              unit="%"
              formatter={(v) => v.toFixed(1)}
              deltaPct={deltas.readRate.pct}
              sparklineColor="#0ea5e9"
              sparklineFill="rgba(14, 165, 233, 0.12)"
              hint="Avg viewers / audience per post"
            />
          </>
        )}
      </div>

      {/* Activity Timeline */}
      {isLoading || !insights ? (
        <SectionSkeleton height={260} />
      ) : (
        <InsightsActivityTimeline daily={insights.daily} />
      )}

      {/* Two-column engagement breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 min-w-0">
        {isLoading || !insights ? (
          <>
            <SectionSkeleton height={220} />
            <SectionSkeleton height={220} />
          </>
        ) : (
          <>
            <InsightsEngagementByArea byArea={insights.engagement_by_area} />
            <InsightsEngagementByPriority byPriority={insights.engagement_by_priority} />
          </>
        )}
      </div>

      {/* Top posts */}
      {isLoading || !insights ? <SectionSkeleton height={280} /> : <InsightsTopPosts posts={insights.top_posts} />}

      {/* Top contributors + Read health */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 min-w-0">
        {isLoading || !insights ? (
          <>
            <SectionSkeleton height={260} />
            <SectionSkeleton height={260} />
          </>
        ) : (
          <>
            <InsightsTopContributors contributors={insights.top_contributors} />
            <InsightsReadHealth health={insights.read_health} />
          </>
        )}
      </div>

      {/* Workforce reach */}
      {isLoading || !insights ? (
        <SectionSkeleton height={180} />
      ) : (
        <InsightsWorkforceReach reach={insights.workforce_reach} />
      )}
    </div>
  );
}
