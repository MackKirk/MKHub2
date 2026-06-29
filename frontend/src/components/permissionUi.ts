import { uiTypography, uiCx } from '@/components/ui';

/** Shared typography for dense permission rows (matches AppInput / AppSelect at text-xs). */
export const permissionUi = {
  groupTitle: uiTypography.sectionTitle,
  subgroupTitle: uiCx(uiTypography.controlLabel, 'mb-2 block'),
  columnTitle: uiTypography.overline,
  rowTitle: 'text-xs font-medium text-gray-900',
  rowDescription: uiTypography.helper,
} as const;
