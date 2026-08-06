import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProjectMapClusterPopup, ProjectMapSinglePopup } from './ProjectMapPopup';
import { OPPORTUNITY_MAP_LABELS, PROJECT_MAP_LABELS } from '../../lib/mapViewLabels';
import type { LocationGroup, ProjectMapPoint } from './projectMap.types';

const basePoint: ProjectMapPoint = {
  id: 'p1',
  code: 'MK-100',
  name: 'Sample Project With A Very Long Name That Should Clamp To Two Lines',
  customer_name: 'Acme Corp',
  address_street: '6222 Willingdon Ave',
  address_city_line: 'Burnaby, BC V5H 0G3',
  latitude: 49.28,
  longitude: -123.12,
  status: 'in progress',
  status_label: 'In Progress',
  division_names: ['SBS Repairs'],
  estimator: null,
  project_admin: null,
};

function makeClusterPoint(id: string, code: string, name: string): ProjectMapPoint {
  return {
    ...basePoint,
    id,
    code,
    name,
    address_street: 'Arbutus Village',
    address_city_line: 'Vancouver, BC',
    division_names: ['SBS Repairs'],
    status_label: 'Prospecting',
    status: 'prospecting',
    estimator: { id: 'e1', name: 'Callum', avatar_file_id: null },
    project_admin: { id: 'a1', name: 'Breanne Topham', avatar_file_id: null },
  };
}

const clusterGroup: LocationGroup = {
  key: '49.280000,-123.120000',
  lat: 49.28,
  lng: -123.12,
  projects: [
    makeClusterPoint('p1', 'MK-00424/00057-2026', 'Strata VR146 · WO 11348'),
    makeClusterPoint('p2', 'MK-00351/00057-2026', 'Pool Roof & Gutter Replacement'),
  ],
};

describe('ProjectMapSinglePopup', () => {
  it('renders header hierarchy and status badge', () => {
    render(
      <ProjectMapSinglePopup
        point={basePoint}
        labels={PROJECT_MAP_LABELS}
        onOpen={() => {}}
      />,
    );
    expect(screen.getByText(basePoint.name)).toBeInTheDocument();
    expect(screen.getByText('MK-100')).toBeInTheDocument();
    expect(screen.getByText('Acme Corp')).toBeInTheDocument();
    expect(screen.getByText('In Progress')).toBeInTheDocument();
  });

  it('renders estimator and project admin for projects', () => {
    render(
      <ProjectMapSinglePopup
        point={basePoint}
        labels={PROJECT_MAP_LABELS}
        listKind="projects"
        onOpen={() => {}}
      />,
    );
    expect(screen.getByText('Estimator')).toBeInTheDocument();
    expect(screen.getByText('Project Admin')).toBeInTheDocument();
    expect(screen.getAllByText('Unassigned')).toHaveLength(2);
  });

  it('renders only estimator for opportunities', () => {
    render(
      <ProjectMapSinglePopup
        point={basePoint}
        labels={OPPORTUNITY_MAP_LABELS}
        listKind="opportunities"
        onOpen={() => {}}
      />,
    );
    expect(screen.getByText('Estimator')).toBeInTheDocument();
    expect(screen.queryByText('Project Admin')).not.toBeInTheDocument();
  });
});

describe('ProjectMapClusterPopup', () => {
  it('shows location header once and project rows without repeated address', () => {
    render(
      <ProjectMapClusterPopup
        group={clusterGroup}
        labels={PROJECT_MAP_LABELS}
        listKind="projects"
        onOpen={() => {}}
      />,
    );

    expect(screen.getByText('Arbutus Village')).toBeInTheDocument();
    expect(screen.getByText(/2 projects at this location/)).toBeInTheDocument();
    expect(screen.getByText('MK-00424/00057-2026')).toBeInTheDocument();
    expect(screen.getByText('MK-00351/00057-2026')).toBeInTheDocument();
    expect(screen.getByText('Strata VR146 · WO 11348')).toBeInTheDocument();
    expect(screen.getByText('Pool Roof & Gutter Replacement')).toBeInTheDocument();
    expect(screen.getAllByText('SBS Repairs')).toHaveLength(2);
    expect(screen.queryByText('Vancouver, BC', { exact: false })).toBeInTheDocument();
  });

  it('shows estimator and project admin in project rows', () => {
    render(
      <ProjectMapClusterPopup
        group={clusterGroup}
        labels={PROJECT_MAP_LABELS}
        listKind="projects"
        onOpen={() => {}}
      />,
    );

    expect(screen.getAllByText('Estimator')).toHaveLength(2);
    expect(screen.getAllByText('Project Admin')).toHaveLength(2);
    expect(screen.getAllByText('Callum')).toHaveLength(2);
    expect(screen.getAllByText('Breanne Topham')).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Open project' })).toHaveLength(2);
  });

  it('shows only estimator for opportunities', () => {
    render(
      <ProjectMapClusterPopup
        group={clusterGroup}
        labels={OPPORTUNITY_MAP_LABELS}
        listKind="opportunities"
        onOpen={() => {}}
      />,
    );

    expect(screen.getAllByText('Estimator')).toHaveLength(2);
    expect(screen.queryByText(/Project Admin:/)).not.toBeInTheDocument();
  });

  it('collapses long lists and expands on see all', () => {
    const largeGroup: LocationGroup = {
      ...clusterGroup,
      projects: Array.from({ length: 8 }, (_, i) =>
        makeClusterPoint(`p${i}`, `MK-00${i}`, `Project ${i}`),
      ),
    };

    render(
      <ProjectMapClusterPopup
        group={largeGroup}
        labels={PROJECT_MAP_LABELS}
        listKind="projects"
        onOpen={() => {}}
      />,
    );

    expect(screen.getByText('MK-000')).toBeInTheDocument();
    expect(screen.getByText('MK-003')).toBeInTheDocument();
    expect(screen.queryByText('MK-007')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'See all 8 projects' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'See all 8 projects' }));
    expect(screen.getByText('MK-007')).toBeInTheDocument();
  });
});
