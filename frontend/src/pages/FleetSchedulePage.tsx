import { useSearchParams, Link } from 'react-router-dom';
import FleetServiceCalendar from './FleetServiceCalendar';
import InspectionSchedules from './InspectionSchedules';

type View = 'calendar' | 'list';

export default function FleetSchedulePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const view = (searchParams.get('view') as View) || 'calendar';

  const setView = (v: View) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('view', v);
      return next;
    });
  };

  return (
    <div className="p-4 max-w-6xl mx-auto space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-xl font-bold text-gray-900">Schedule</h1>
        <div className="flex items-center gap-2">
          <Link
            to="/fleet/inspections/new"
            className="px-4 py-2 rounded-lg border border-blue-600 text-blue-700 text-sm font-medium hover:bg-blue-50 transition-colors"
          >
            Schedule inspection
          </Link>
          <Link
            to="/fleet/work-orders/new?entity_type=fleet"
            className="px-4 py-2 rounded-lg bg-brand-red text-white text-sm font-medium hover:bg-red-700 transition-colors"
          >
            New service
          </Link>
          <Link
            to="/fleet/work-orders"
            className="px-4 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            Work orders
          </Link>
        </div>
      </div>

      <div className="flex gap-1 border-b border-gray-200">
        <button
          type="button"
          onClick={() => setView('calendar')}
          className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
            view === 'calendar'
              ? 'bg-white border border-b-0 border-gray-200 text-gray-900 -mb-px'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Calendar
        </button>
        <button
          type="button"
          onClick={() => setView('list')}
          className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
            view === 'list'
              ? 'bg-white border border-b-0 border-gray-200 text-gray-900 -mb-px'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          List
        </button>
      </div>

      {view === 'calendar' ? (
        <FleetServiceCalendar embedView />
      ) : (
        <InspectionSchedules />
      )}
    </div>
  );
}
