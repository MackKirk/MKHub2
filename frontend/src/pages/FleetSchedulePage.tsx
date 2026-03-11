import { Link } from 'react-router-dom';
import FleetServiceCalendar from './FleetServiceCalendar';

export default function FleetSchedulePage() {
  return (
    <div className="p-4 max-w-6xl mx-auto space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-xl font-bold text-gray-900">Schedule</h1>
        <Link
          to="/fleet/inspections/new"
          className="px-4 py-2 rounded-lg bg-brand-red text-white text-sm font-medium hover:bg-red-700 transition-colors"
        >
          Schedule new inspection
        </Link>
      </div>

      <FleetServiceCalendar embedView />
    </div>
  );
}
