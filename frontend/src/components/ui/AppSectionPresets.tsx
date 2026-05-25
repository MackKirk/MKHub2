import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  BookOpen,
  Briefcase,
  Building2,
  FileText,
  Heart,
  MapPin,
  Phone,
  Receipt,
  Shield,
  User,
} from 'lucide-react';

/** Semantic section keys — same palette as User Details / Customer General tabs. */
export type AppSectionPresetKey =
  | 'company'
  | 'address'
  | 'billing'
  | 'description'
  | 'basicInformation'
  | 'contact'
  | 'education'
  | 'employment'
  | 'emergency'
  | 'documents'
  | 'files'
  | 'opportunities'
  | 'projects';

type SectionPresetDef = {
  iconClassName: string;
  Icon: LucideIcon;
};

const SECTION_PRESETS: Record<AppSectionPresetKey, SectionPresetDef> = {
  company: { iconClassName: 'bg-blue-100 text-blue-800', Icon: Building2 },
  address: { iconClassName: 'bg-green-100 text-green-800', Icon: MapPin },
  billing: { iconClassName: 'bg-amber-100 text-amber-800', Icon: Receipt },
  description: { iconClassName: 'bg-gray-100 text-gray-800', Icon: FileText },
  basicInformation: { iconClassName: 'bg-blue-100 text-blue-800', Icon: User },
  contact: { iconClassName: 'bg-yellow-100 text-yellow-800', Icon: Phone },
  education: { iconClassName: 'bg-indigo-100 text-indigo-800', Icon: BookOpen },
  employment: { iconClassName: 'bg-orange-100 text-orange-800', Icon: Briefcase },
  emergency: { iconClassName: 'bg-red-100 text-red-800', Icon: Heart },
  documents: { iconClassName: 'bg-purple-100 text-purple-800', Icon: Shield },
  files: { iconClassName: 'bg-purple-100 text-purple-800', Icon: Shield },
  opportunities: { iconClassName: 'bg-indigo-100 text-indigo-800', Icon: Briefcase },
  projects: { iconClassName: 'bg-orange-100 text-orange-800', Icon: Briefcase },
};

/** Spread onto `AppSectionHeader` (icon + iconClassName). */
export function appSectionPresetProps(key: AppSectionPresetKey): {
  icon: ReactNode;
  iconClassName: string;
} {
  const { Icon, iconClassName } = SECTION_PRESETS[key];
  return {
    icon: <Icon className="h-4 w-4" aria-hidden />,
    iconClassName,
  };
}

export const APP_SECTION_PRESET_KEYS = Object.keys(SECTION_PRESETS) as AppSectionPresetKey[];
