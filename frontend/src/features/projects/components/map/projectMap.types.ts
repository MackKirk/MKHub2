export type MapPointPerson = {
  id: string;
  name: string;
  avatar_file_id?: string | null;
};

export type ProjectMapPoint = {
  id: string;
  code: string;
  name: string;
  customer_name?: string | null;
  address?: string | null;
  address_street?: string | null;
  address_city_line?: string | null;
  latitude: number;
  longitude: number;
  status: string;
  status_label?: string | null;
  division_names: string[];
  estimator?: MapPointPerson | null;
  project_admin?: MapPointPerson | null;
  start_date?: string | null;
  end_date?: string | null;
};

export type ProjectMapPointsResponse = {
  items: ProjectMapPoint[];
  mapped_count: number;
  unmapped_count: number;
  total_matching: number;
};

export type MapBounds = {
  north: number;
  south: number;
  east: number;
  west: number;
  zoom: number;
};

export type MapListKind = 'projects' | 'opportunities';

export type MapViewLabels = {
  entitySingular: string;
  entityPlural: string;
  openAction: string;
  openActionShort: string;
  projectsAtLocation: (count: number) => string;
  seeAllAtLocation: (count: number) => string;
  noMatchFilters: string;
  noValidLocations: string;
  mapAriaLabel: string;
};

export type LocationGroup = {
  key: string;
  lat: number;
  lng: number;
  projects: ProjectMapPoint[];
};
