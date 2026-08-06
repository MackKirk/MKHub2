import type { MapViewLabels } from '../components/map/projectMap.types';

export const PROJECT_MAP_LABELS: MapViewLabels = {
  entitySingular: 'project',
  entityPlural: 'projects',
  openAction: 'Open project',
  openActionShort: 'Open →',
  projectsAtLocation: (count) => `${count} project${count === 1 ? '' : 's'} at this location`,
  seeAllAtLocation: (count) => `See all ${count} projects`,
  noMatchFilters: 'No projects match the current filters.',
  noValidLocations: 'The matching projects do not have valid map locations yet.',
  mapAriaLabel: 'Projects map',
};

export const OPPORTUNITY_MAP_LABELS: MapViewLabels = {
  entitySingular: 'opportunity',
  entityPlural: 'opportunities',
  openAction: 'Open opportunity',
  openActionShort: 'Open →',
  projectsAtLocation: (count) => `${count} opportunit${count === 1 ? 'y' : 'ies'} at this location`,
  seeAllAtLocation: (count) => `See all ${count} opportunities`,
  noMatchFilters: 'No opportunities match the current filters.',
  noValidLocations: 'The matching opportunities do not have valid map locations yet.',
  mapAriaLabel: 'Opportunities map',
};
