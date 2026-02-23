/**
 * Division icons: maps division labels to image paths.
 * Icons are in frontend/src/icons/; add new PNGs there and extend iconMap.
 */

import CarpentryIcon from '@/icons/Carpentry.png';
import ConcreteRestorationIcon from '@/icons/ConcreteRestoration.png';
import GreenRoofingIcon from '@/icons/GreenRoofing.png';
import RoofingIcon from '@/icons/Roofing.png';
import SolarPVIcon from '@/icons/SolarPV.png';
import StructuralUpgradeIcon from '@/icons/StructuralUpgrade.png';
import WeldingIcon from '@/icons/Welding e Custom Fabrication.png';
import CladdingIcon from '@/icons/cladding e exterior finishes.png';
import ElectricalIcon from '@/icons/electrical.png';
import MechanicalIcon from '@/icons/mechanical.png';
import RepairsMaintenanceIcon from '@/icons/repairsMaintenance.png';

const divisionIconUrls: Record<string, string> = {
  'Roofing': RoofingIcon,
  'Concrete Restoration & Waterproofing': ConcreteRestorationIcon,
  'Cladding & Exterior Finishes': CladdingIcon,
  'Repairs & Maintenance': RepairsMaintenanceIcon,
  'Mechanical': MechanicalIcon,
  'Electrical': ElectricalIcon,
  'Carpentry': CarpentryIcon,
  'Welding & Custom Fabrication': WeldingIcon,
  'Structural Upgrading': StructuralUpgradeIcon,
  'Solar PV': SolarPVIcon,
  'Green Roofing': GreenRoofingIcon,
};

const fallbackEmoji: Record<string, string> = {
  'Roofing': '🏠',
  'Concrete Restoration & Waterproofing': '🏗️',
  'Cladding & Exterior Finishes': '🧱',
  'Repairs & Maintenance': '🔧',
  'Mechanical': '🔩',
  'Electrical': '⚡',
  'Carpentry': '🪵',
  'Welding & Custom Fabrication': '🔥',
  'Structural Upgrading': '📐',
  'Solar PV': '☀️',
  'Green Roofing': '🌱',
};

const DEFAULT_FALLBACK = '📦';

/** Returns the image URL for a division label, or null if not found. */
export function getDivisionIconUrl(label: string): string | null {
  return divisionIconUrls[label] ?? null;
}

/** Returns fallback emoji for a division label (used when image is not available). */
export function getDivisionIconFallback(label: string): string {
  return fallbackEmoji[label] ?? DEFAULT_FALLBACK;
}
