import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

type ProjectDivision = {
  id: string;
  label: string;
  value: string;
  subdivisions: Array<{ id: string; label: string; value: string }>;
};

type DivisionStats = {
  id: string;
  label: string;
  value: string;
  opportunities_count: number;
  projects_count: number;
  opportunities_value: number;
  projects_value: number;
  subdivisions: Array<{ id: string; label: string; value: string }>;
};

type DashboardStats = {
  total_opportunities: number;
  total_projects: number;
  opportunities_by_status: Record<string, number>;
  projects_by_status: Record<string, number>;
  total_estimated_value: number;
  total_actual_value: number;
  division_id?: string;
};

// Icon mapping for divisions
const getDivisionIcon = (label: string): string => {
  const iconMap: Record<string, string> = {
    'Roofing': '🏠',
    'Concrete Restoration & Waterproofing': '🏗️',
    'Cladding & Exterior Finishes': '🧱',
    'Repairs & Maintenance': '🔧',
    'Mack Kirk Metals': '⚙️',
    'Mechanical': '🔩',
    'Electrical': '⚡',
    'Carpentry': '🪵',
    'Welding & Custom Fabrication': '🔥',
    'Structural Upgrading': '📐',
    'Solar PV': '☀️',
    'Green Roofing': '🌱',
  };
  return iconMap[label] || '📦';
};

export default function BusinessDashboard() {
  const navigate = useNavigate();
  const [selectedDivisionId, setSelectedDivisionId] = useState<string>('');
  
  // Get project divisions (hierarchical)
  const { data: divisionsData, isLoading: divisionsLoading, error: divisionsError } = useQuery<ProjectDivision[]>({
    queryKey: ['project-divisions'],
    queryFn: async () => {
      try {
        const result = await api('GET', '/settings/project-divisions');
        console.log('Project divisions loaded:', result);
        return result;
      } catch (e) {
        console.error('Failed to load project divisions:', e);
        return [];
      }
    },
    staleTime: 300_000,
    initialData: [],
  });

  // Get division statistics
  const { data: divisionsStats, isLoading: statsLoading } = useQuery<DivisionStats[]>({
    queryKey: ['business-divisions-stats'],
    queryFn: async () => {
      try {
        return await api('GET', '/projects/business/divisions-stats');
      } catch (e) {
        console.warn('Failed to load division stats:', e);
        return [];
      }
    },
    staleTime: 60_000, // Refresh every minute
  });

  // Get overall dashboard stats
  const { data: stats, isLoading: overallStatsLoading } = useQuery<DashboardStats>({
    queryKey: ['business-dashboard', selectedDivisionId],
    queryFn: () => {
      const params = selectedDivisionId ? `?division_id=${encodeURIComponent(selectedDivisionId)}` : '';
      return api('GET', `/projects/business/dashboard${params}`);
    },
  });

  const divisions = Array.isArray(divisionsData) ? divisionsData : [];
  const statsByDivision = Array.isArray(divisionsStats) ? divisionsStats : [];

  const selectedDivision = useMemo(() => {
    return divisions.find(d => d.id === selectedDivisionId);
  }, [divisions, selectedDivisionId]);

  const handleDivisionClick = (divisionId: string) => {
    setSelectedDivisionId(divisionId);
  };

  const handleViewOpportunities = (divisionId?: string) => {
    const params = divisionId ? `?division_id=${encodeURIComponent(divisionId)}` : '';
    navigate(`/opportunities${params}`);
  };

  const handleViewProjects = (divisionId?: string) => {
    const params = divisionId ? `?division_id=${encodeURIComponent(divisionId)}` : '';
    navigate(`/projects${params}`);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="mb-3 rounded-xl border bg-gradient-to-br from-[#7f1010] to-[#a31414] text-white p-4">
        <div className="text-2xl font-extrabold">Business Dashboard</div>
        <div className="text-sm opacity-90">Overview of opportunities and projects by division</div>
      </div>

      {/* Quick Filter Buttons */}
      {divisions.length > 0 && (
        <div className="mb-4 rounded-xl border bg-white p-4">
          <div className="text-sm font-medium text-gray-700 mb-3">Quick Filters by Division</div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {divisions.map((division) => {
              const divisionStat = statsByDivision.find(s => s.id === division.id);
              const oppCount = divisionStat?.opportunities_count || 0;
              const projCount = divisionStat?.projects_count || 0;
              const totalCount = oppCount + projCount;
              
              return (
                <div
                  key={division.id}
                  className={`rounded-lg border p-3 transition-all ${
                    totalCount > 0
                      ? 'bg-white hover:shadow-md cursor-pointer'
                      : 'bg-gray-50 opacity-60'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-2xl">{getDivisionIcon(division.label)}</span>
                    <span className="font-medium text-sm flex-1">{division.label}</span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        if (oppCount > 0) {
                          navigate(`/opportunities?division_id=${encodeURIComponent(division.id)}`);
                        }
                      }}
                      disabled={oppCount === 0}
                      className={`flex-1 px-2 py-1.5 rounded text-xs font-medium transition-colors ${
                        oppCount > 0
                          ? 'bg-[#7f1010] text-white hover:bg-[#a31414]'
                          : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                      }`}
                      title={oppCount > 0 ? `View ${oppCount} opportunities` : 'No opportunities'}
                    >
                      {oppCount} Opp
                    </button>
                    <button
                      onClick={() => {
                        if (projCount > 0) {
                          navigate(`/projects?division_id=${encodeURIComponent(division.id)}`);
                        }
                      }}
                      disabled={projCount === 0}
                      className={`flex-1 px-2 py-1.5 rounded text-xs font-medium transition-colors ${
                        projCount > 0
                          ? 'bg-[#7f1010] text-white hover:bg-[#a31414]'
                          : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                      }`}
                      title={projCount > 0 ? `View ${projCount} projects` : 'No projects'}
                    >
                      {projCount} Proj
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Division Cards Grid - Similar to FleetDashboard */}
      {divisionsLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((i) => (
            <div key={i} className="h-32 bg-gray-100 animate-pulse rounded-xl" />
          ))}
        </div>
      ) : divisionsError ? (
        <div className="rounded-xl border bg-red-50 p-6 text-center">
          <div className="text-red-700 font-semibold mb-2">Erro ao carregar divisões</div>
          <div className="text-sm text-red-600">{String(divisionsError)}</div>
          <div className="text-xs text-gray-500 mt-2">Verifique o console para mais detalhes</div>
        </div>
      ) : divisions.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {divisions.map((division) => {
            const divisionStat = statsByDivision.find(s => s.id === division.id);
            const oppCount = divisionStat?.opportunities_count || 0;
            const projCount = divisionStat?.projects_count || 0;
            const hasSubdivisions = division.subdivisions && division.subdivisions.length > 0;

            return (
              <div
                key={division.id}
                onClick={() => handleDivisionClick(division.id === selectedDivisionId ? '' : division.id)}
                className={`rounded-xl border bg-white p-4 hover:shadow-md transition-all cursor-pointer ${
                  selectedDivisionId === division.id ? 'ring-2 ring-[#7f1010] shadow-md' : ''
                }`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="text-4xl">{getDivisionIcon(division.label)}</div>
                  {hasSubdivisions && (
                    <div className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
                      {division.subdivisions.length} sub
                    </div>
                  )}
                </div>
                <div className="text-lg font-semibold text-gray-900 mb-2">{division.label}</div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <div className="text-gray-600">Opportunities</div>
                    <div className="text-xl font-bold text-[#7f1010]">{oppCount}</div>
                  </div>
                  <div>
                    <div className="text-gray-600">Projects</div>
                    <div className="text-xl font-bold text-[#7f1010]">{projCount}</div>
                  </div>
                </div>
                {divisionStat && (divisionStat.opportunities_value > 0 || divisionStat.projects_value > 0) && (
                  <div className="mt-2 pt-2 border-t text-xs text-gray-500">
                    <div>Est: ${divisionStat.opportunities_value.toLocaleString()}</div>
                    <div>Act: ${divisionStat.projects_value.toLocaleString()}</div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-xl border bg-white p-6 text-center text-gray-500">
          No project divisions found. Please run the seed script to create divisions.
        </div>
      )}

      {/* Selected Division Details */}
      {selectedDivision && (
        <div className="rounded-xl border bg-white p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-lg font-semibold text-gray-900">
                {getDivisionIcon(selectedDivision.label)} {selectedDivision.label}
              </div>
              {selectedDivision.subdivisions.length > 0 && (
                <div className="text-sm text-gray-600 mt-1">
                  {selectedDivision.subdivisions.length} subdivision{selectedDivision.subdivisions.length !== 1 ? 's' : ''}
                </div>
              )}
            </div>
            <button
              onClick={() => setSelectedDivisionId('')}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Clear filter
            </button>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => handleViewOpportunities(selectedDivision.id)}
              className="px-4 py-2 bg-[#7f1010] text-white rounded-lg hover:bg-[#a31414] transition-colors"
            >
              View Opportunities
            </button>
            <button
              onClick={() => handleViewProjects(selectedDivision.id)}
              className="px-4 py-2 bg-[#7f1010] text-white rounded-lg hover:bg-[#a31414] transition-colors"
            >
              View Projects
            </button>
          </div>
        </div>
      )}

      {/* Overall Statistics Cards */}
      {overallStatsLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-32 bg-gray-100 animate-pulse rounded-xl" />
          ))}
        </div>
      ) : stats ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Total Opportunities */}
          <div className="rounded-xl border bg-white p-6 shadow-sm">
            <div className="text-sm font-medium text-gray-600 mb-1">Total Opportunities</div>
            <div className="text-3xl font-bold text-[#7f1010]">{stats.total_opportunities}</div>
            <div className="mt-2 text-xs text-gray-500">
              Estimated Value: ${stats.total_estimated_value.toLocaleString()}
            </div>
          </div>

          {/* Total Projects */}
          <div className="rounded-xl border bg-white p-6 shadow-sm">
            <div className="text-sm font-medium text-gray-600 mb-1">Active Projects</div>
            <div className="text-3xl font-bold text-[#7f1010]">{stats.total_projects}</div>
            <div className="mt-2 text-xs text-gray-500">
              Actual Value: ${stats.total_actual_value.toLocaleString()}
            </div>
          </div>

          {/* Opportunities by Status */}
          <div className="rounded-xl border bg-white p-6 shadow-sm">
            <div className="text-sm font-medium text-gray-600 mb-2">Opportunities by Status</div>
            <div className="space-y-1">
              {Object.entries(stats.opportunities_by_status).map(([status, count]) => (
                <div key={status} className="flex justify-between text-sm">
                  <span className="text-gray-700 truncate">{status}</span>
                  <span className="font-semibold text-[#7f1010]">{count}</span>
                </div>
              ))}
              {Object.keys(stats.opportunities_by_status).length === 0 && (
                <div className="text-sm text-gray-400">No status data</div>
              )}
            </div>
          </div>

          {/* Projects by Status */}
          <div className="rounded-xl border bg-white p-6 shadow-sm">
            <div className="text-sm font-medium text-gray-600 mb-2">Projects by Status</div>
            <div className="space-y-1">
              {Object.entries(stats.projects_by_status).map(([status, count]) => (
                <div key={status} className="flex justify-between text-sm">
                  <span className="text-gray-700 truncate">{status}</span>
                  <span className="font-semibold text-[#7f1010]">{count}</span>
                </div>
              ))}
              {Object.keys(stats.projects_by_status).length === 0 && (
                <div className="text-sm text-gray-400">No status data</div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {/* Action Buttons */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Link
          to={`/opportunities${selectedDivisionId ? `?division_id=${encodeURIComponent(selectedDivisionId)}` : ''}`}
          className="rounded-xl border bg-white p-6 shadow-sm hover:shadow-md transition-shadow"
        >
          <div className="flex items-center justify-between">
            <div>
              <div className="text-lg font-semibold text-gray-900">View All Opportunities</div>
              <div className="text-sm text-gray-600 mt-1">
                Browse and manage all bidding opportunities
              </div>
            </div>
            <div className="text-2xl">→</div>
          </div>
        </Link>

        <Link
          to={`/projects${selectedDivisionId ? `?division_id=${encodeURIComponent(selectedDivisionId)}` : ''}`}
          className="rounded-xl border bg-white p-6 shadow-sm hover:shadow-md transition-shadow"
        >
          <div className="flex items-center justify-between">
            <div>
              <div className="text-lg font-semibold text-gray-900">View All Projects</div>
              <div className="text-sm text-gray-600 mt-1">
                Browse and manage all active projects
              </div>
            </div>
            <div className="text-2xl">→</div>
          </div>
        </Link>
      </div>
    </div>
  );
}
