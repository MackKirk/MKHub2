import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';

type Group = {
  id: string;
  name: string;
  description?: string;
  member_count?: number;
  member_ids?: string[];
  created_at?: string;
};

export default function CommunityGroups() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [showManageMembersModal, setShowManageMembersModal] = useState(false);
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDescription, setNewGroupDescription] = useState('');

  // Fetch groups - placeholder for now
  const { data: groupsData, isLoading } = useQuery({
    queryKey: ['community-groups'],
    queryFn: () => api<any>('GET', '/community/groups').catch(() => []),
  });

  // Ensure groups is always an array
  const groups: Group[] = Array.isArray(groupsData) ? groupsData : [];

  // Fetch employees for adding to groups
  const { data: employeesData } = useQuery({
    queryKey: ['employees'],
    queryFn: () => api<any[]>('GET', '/employees').catch(() => []),
  });

  // Ensure employees is always an array
  const employees: any[] = Array.isArray(employeesData) ? employeesData : [];

  // Fetch selected group details when managing members
  const { data: selectedGroupData } = useQuery({
    queryKey: ['community-group', selectedGroup?.id],
    queryFn: () => api<Group>('GET', `/community/groups/${selectedGroup?.id}`),
    enabled: !!selectedGroup?.id && showManageMembersModal,
  });

  const createGroupMutation = useMutation({
    mutationFn: (payload: { name: string; description?: string }) =>
      api('POST', '/community/groups', payload),
    onSuccess: () => {
      toast.success('Group created successfully!');
      queryClient.invalidateQueries({ queryKey: ['community-groups'] });
      setShowCreateModal(false);
      setNewGroupName('');
      setNewGroupDescription('');
    },
    onError: (err: any) => {
      console.error('Error creating group:', err);
      const errorMessage = err?.response?.data?.detail || err?.message || 'Failed to create group';
      toast.error(errorMessage);
    },
  });

  const updateGroupMembersMutation = useMutation({
    mutationFn: (payload: { groupId: string; memberIds: string[] }) =>
      api('PUT', `/community/groups/${payload.groupId}/members`, { member_ids: payload.memberIds }),
    onSuccess: () => {
      toast.success('Group members updated successfully!');
      queryClient.invalidateQueries({ queryKey: ['community-groups'] });
      queryClient.invalidateQueries({ queryKey: ['community-group', selectedGroup?.id] });
      setShowManageMembersModal(false);
      setSelectedMembers([]);
    },
    onError: (err: any) => {
      console.error('Error updating group members:', err);
      const errorMessage = err?.response?.data?.detail || err?.message || 'Failed to update group members';
      toast.error(errorMessage);
    },
  });

  const handleCreateGroup = () => {
    if (!newGroupName.trim()) {
      toast.error('Group name is required');
      return;
    }
    createGroupMutation.mutate({
      name: newGroupName.trim(),
      description: newGroupDescription.trim() || undefined,
    });
  };

  const handleManageMembers = (group: Group) => {
    setSelectedGroup(group);
    setShowManageMembersModal(true);
    // Initial members will be loaded via useQuery
  };

  // Update selected members when group data is loaded
  useEffect(() => {
    if (selectedGroupData && showManageMembersModal) {
      setSelectedMembers(selectedGroupData.member_ids || []);
    }
  }, [selectedGroupData, showManageMembersModal]);

  const handleSaveMembers = () => {
    if (selectedGroup) {
      updateGroupMembersMutation.mutate({ groupId: selectedGroup.id, memberIds: selectedMembers });
    }
  };

  const toggleMember = (employeeId: string) => {
    setSelectedMembers((prev) =>
      prev.includes(employeeId)
        ? prev.filter((id) => id !== employeeId)
        : [...prev, employeeId]
    );
  };

  return (
    <div className="space-y-4">
      <div className="mb-3 rounded-xl border bg-gradient-to-br from-[#7f1010] to-[#a31414] text-white p-4">
        <div className="text-2xl font-extrabold">Groups</div>
        <div className="text-sm opacity-90">Create and manage groups to organize your team.</div>
      </div>

      <div className="mb-3 flex items-center justify-between">
        <button
          onClick={() => navigate('/community')}
          className="p-2 rounded-lg border hover:bg-gray-50 transition-colors flex items-center gap-2"
          title="Back to Community"
        >
          <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          <span className="text-sm text-gray-700 font-medium">Back to Community</span>
        </button>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 rounded-lg bg-brand-red text-white hover:bg-red-700 transition"
        >
          + Create Group
        </button>
      </div>

      {isLoading ? (
        <div className="text-center text-gray-500 py-8">Loading groups...</div>
      ) : groups.length === 0 ? (
        <div className="rounded-xl border bg-white p-8 text-center">
          <p className="text-gray-600 mb-4">No groups created yet.</p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 rounded-lg bg-brand-red text-white hover:bg-red-700 transition"
          >
            Create your first group
          </button>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {groups.map((group) => (
            <div
              key={group.id}
              className="rounded-xl border bg-white p-4 hover:shadow-md transition"
            >
              <div className="font-semibold text-lg mb-1">{group.name}</div>
              {group.description && (
                <p className="text-sm text-gray-600 mb-3 line-clamp-2">{group.description}</p>
              )}
              <div className="text-xs text-gray-500 mb-3">
                {group.member_count || 0} member{group.member_count !== 1 ? 's' : ''}
              </div>
              <div className="flex justify-end">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleManageMembers(group);
                  }}
                  className="px-3 py-1.5 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 transition text-sm"
                >
                  Manage Members
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Group Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 space-y-4">
            <h2 className="text-xl font-semibold">Create New Group</h2>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Group Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="Enter group name..."
                className="w-full rounded-lg border border-gray-300 px-4 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Description (Optional)
              </label>
              <textarea
                value={newGroupDescription}
                onChange={(e) => setNewGroupDescription(e.target.value)}
                placeholder="Enter group description..."
                rows={3}
                className="w-full rounded-lg border border-gray-300 px-4 py-2"
              />
            </div>
            <div className="flex justify-end gap-3 pt-4 border-t">
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setNewGroupName('');
                  setNewGroupDescription('');
                }}
                className="px-4 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateGroup}
                disabled={!newGroupName.trim() || createGroupMutation.isLoading}
                className="px-4 py-2 rounded-lg bg-brand-red text-white hover:bg-red-700 disabled:opacity-50"
              >
                {createGroupMutation.isLoading ? 'Creating...' : 'Create Group'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manage Members Modal */}
      {showManageMembersModal && selectedGroup && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 space-y-4">
            <h3 className="text-lg font-semibold">Manage Members for "{selectedGroup.name}"</h3>
            <div className="max-h-80 overflow-y-auto border rounded-lg p-3 space-y-2">
              {employees.length === 0 ? (
                <div className="text-sm text-gray-500">No employees available.</div>
              ) : (
                employees.map((employee) => (
                  <div key={employee.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {employee.profile_photo_file_id ? (
                        <img
                          src={`/files/${employee.profile_photo_file_id}/thumbnail?w=40`}
                          alt={employee.name}
                          className="w-8 h-8 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs text-gray-500">
                          {employee.name ? employee.name[0].toUpperCase() : 'U'}
                        </div>
                      )}
                      <span className="text-sm text-gray-800">{employee.name}</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={selectedMembers.includes(employee.id)}
                      onChange={() => toggleMember(employee.id)}
                      className="w-4 h-4 rounded border-gray-300 text-brand-red focus:ring-brand-red"
                    />
                  </div>
                ))
              )}
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowManageMembersModal(false);
                  setSelectedMembers([]);
                }}
                className="px-4 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveMembers}
                disabled={updateGroupMembersMutation.isLoading}
                className="px-4 py-2 rounded-lg bg-brand-red text-white hover:bg-red-700 transition disabled:opacity-50"
              >
                {updateGroupMembersMutation.isLoading ? 'Saving...' : 'Save Members'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

