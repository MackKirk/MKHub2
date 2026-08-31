import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import {
  filterProjectDivisionsForBusinessLine,
  PROJECT_DIVISIONS_QUERY_KEY,
} from '@/lib/businessLine';
import { AppSelect, uiTypography, uiCx } from '@/components/ui';
import type { MeForHomeWidgets } from './widgetVisibility';
import {
  getAccessibleHomeBusinessLines,
  getBusinessLineLabel,
  inferDefaultHomeBusinessLine,
  HOME_BUSINESS_LINE_OPTIONS,
  type HomeBusinessLine,
} from './homeBusinessLine';

type ProjectDivision = { id: string; label?: string; subdivisions?: ProjectDivision[] };

function flattenDivisions(divisions: ProjectDivision[]): { id: string; label: string }[] {
  const out: { id: string; label: string }[] = [];
  for (const d of divisions) {
    if (d.id && d.label) out.push({ id: d.id, label: d.label });
    if (d.subdivisions?.length) out.push(...flattenDivisions(d.subdivisions));
  }
  return out;
}

type HomeBusinessLineFieldProps = {
  me: MeForHomeWidgets | undefined;
  value: string | undefined;
  onChange: (line: HomeBusinessLine) => void;
};

export function HomeBusinessLineField({ me, value, onChange }: HomeBusinessLineFieldProps) {
  const accessible = useMemo(() => getAccessibleHomeBusinessLines(me), [me]);
  const resolved = value?.trim()
    ? value
    : inferDefaultHomeBusinessLine(me);

  if (accessible.length === 0) return null;

  if (accessible.length === 1) {
    const line = accessible[0];
    return (
      <div>
        <span className={uiCx(uiTypography.controlLabel, 'mb-1 block')}>Business line</span>
        <p className={uiTypography.helper}>{getBusinessLineLabel(line)}</p>
      </div>
    );
  }

  const options = HOME_BUSINESS_LINE_OPTIONS.filter((o) => accessible.includes(o.value)).map((o) => ({
    value: o.value,
    label: o.label,
  }));

  return (
    <AppSelect
      label="Business line"
      value={resolved}
      onChange={(e) => onChange(e.target.value as HomeBusinessLine)}
      options={options}
      helperText="Choose Production or Repairs & Maintenance data for this widget."
    />
  );
}

type HomeDivisionFieldProps = {
  businessLine: string;
  value: string | undefined;
  onChange: (divisionId: string | undefined) => void;
};

export function HomeDivisionField({ businessLine, value, onChange }: HomeDivisionFieldProps) {
  const { data: divisionsRaw } = useQuery<ProjectDivision[]>({
    queryKey: PROJECT_DIVISIONS_QUERY_KEY,
    queryFn: () => api('GET', '/settings/project-divisions'),
    staleTime: 5 * 60_000,
  });

  const divisionOptions = useMemo(() => {
    const filtered = filterProjectDivisionsForBusinessLine(divisionsRaw ?? [], businessLine);
    const flat = flattenDivisions(filtered);
    return [
      { value: '', label: 'All divisions' },
      ...flat.map((d) => ({ value: d.id, label: d.label })),
    ];
  }, [divisionsRaw, businessLine]);

  return (
    <AppSelect
      label="Division"
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || undefined)}
      options={divisionOptions}
      helperText="Optional: filter to a single division."
    />
  );
}

export function divisionExistsInLine(
  divisionId: string | undefined,
  businessLine: string,
  divisionsRaw: ProjectDivision[] | undefined,
): boolean {
  if (!divisionId) return true;
  const filtered = filterProjectDivisionsForBusinessLine(divisionsRaw ?? [], businessLine);
  const flat = flattenDivisions(filtered);
  return flat.some((d) => d.id === divisionId);
}
