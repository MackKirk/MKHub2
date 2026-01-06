import { useState, useEffect, useRef, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import ImagePicker from '@/components/ImagePicker';
import { useConfirm } from '@/components/ConfirmProvider';

type Group = {
  id: string;
  name: string;
  description?: string;
  member_count?: number;
  member_ids?: string[];
  created_at?: string;
  photo_file_id?: string;
};

export default function CommunityGroups() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [showManageMembersModal, setShowManageMembersModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'general' | 'topics'>('general');
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDescription, setNewGroupDescription] = useState('');
  const [editGroupName, setEditGroupName] = useState('');
  const [editGroupPhotoFileId, setEditGroupPhotoFileId] = useState<string | null>(null);
  const [showImagePicker, setShowImagePicker] = useState(false);
  const [newTopicName, setNewTopicName] = useState('');
  const [topics, setTopics] = useState<Array<{ id: string; name: string; posts_count?: number }>>([]);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [renameTopicId, setRenameTopicId] = useState<string | null>(null);
  const [renameTopicName, setRenameTopicName] = useState('');
  const [menuPosition, setMenuPosition] = useState<{ top: number; right: number } | null>(null);
  const menuButtonRefs = useRef<{ [key: string]: HTMLButtonElement | null }>({});

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

  const getFilteredEmployees = () => {
    if (!searchTerm.trim()) return employees;
    const term = searchTerm.toLowerCase();
    return employees.filter((emp) =>
      emp.name?.toLowerCase().includes(term)
    );
  };

  const toggleMember = (employeeId: string) => {
    setSelectedMembers((prev) =>
      prev.includes(employeeId)
        ? prev.filter((id) => id !== employeeId)
        : [...prev, employeeId]
    );
  };

  // Reset search when modal closes
  useEffect(() => {
    if (!showManageMembersModal) {
      setSearchTerm('');
    }
  }, [showManageMembersModal]);

  // Load topics when settings modal opens
  const { data: groupTopics = [] } = useQuery({
    queryKey: ['group-topics', selectedGroup?.id],
    queryFn: () => api<Array<{ id: string; name: string; posts_count?: number }>>('GET', `/community/groups/${selectedGroup?.id}/topics`).catch(() => []),
    enabled: !!selectedGroup?.id && showSettingsModal && settingsTab === 'topics',
  });

  useEffect(() => {
    if (groupTopics && Array.isArray(groupTopics)) {
      setTopics(groupTopics);
    }
  }, [groupTopics]);

  const handleImageConfirm = async (blob: Blob, originalFileObjectId?: string) => {
    try {
      // Upload image
      const formData = new FormData();
      formData.append('file', blob, 'group-photo.png');
      
      const uploadResponse = await api<any>('POST', '/files/upload', formData);
      const fileObjectId = uploadResponse.file_object_id || uploadResponse.id;
      
      if (fileObjectId) {
        setEditGroupPhotoFileId(fileObjectId);
        toast.success('Image uploaded successfully');
      }
    } catch (err: any) {
      console.error('Image upload failed:', err);
      toast.error('Failed to upload image');
    } finally {
      setShowImagePicker(false);
    }
  };

  const handleCreateTopic = async () => {
    if (!newTopicName.trim() || !selectedGroup) return;
    
    try {
      await api('POST', `/community/groups/${selectedGroup.id}/topics`, { name: newTopicName.trim() });
      toast.success('Topic created successfully');
      queryClient.invalidateQueries({ queryKey: ['group-topics', selectedGroup.id] });
      setNewTopicName('');
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to create topic');
    }
  };

  const handleRenameTopic = async () => {
    if (!renameTopicName.trim() || !selectedGroup || !renameTopicId) return;
    
    try {
      await api('PUT', `/community/groups/${selectedGroup.id}/topics/${renameTopicId}`, { name: renameTopicName.trim() });
      toast.success('Topic renamed successfully');
      queryClient.invalidateQueries({ queryKey: ['group-topics', selectedGroup.id] });
      setRenameTopicId(null);
      setRenameTopicName('');
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to rename topic');
    }
  };

  const todayLabel = useMemo(() => {
    return new Date().toLocaleDateString('en-CA', {
      weekday: 'long',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }, []);

  return (
    <div className="space-y-4">
      <div className="bg-slate-200/50 rounded-[12px] border border-slate-200 flex items-center justify-between py-4 px-6 mb-6">
        <div className="flex items-center gap-4 flex-1">
          <button
            onClick={() => navigate('/community')}
            className="p-2 rounded-lg hover:bg-gray-200 transition-colors flex items-center justify-center"
            title="Back to Community"
          >
            <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </button>
          <div>
            <div className="text-xl font-bold text-gray-900 tracking-tight mb-0.5">Groups</div>
            <div className="text-sm text-gray-500 font-medium">Create and manage groups to organize your team.</div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs text-gray-400 mb-1.5 font-medium uppercase tracking-wide">Today</div>
          <div className="text-sm font-semibold text-gray-700">{todayLabel}</div>
        </div>
      </div>

      <div className="mb-3 flex items-center justify-between">
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
              className="rounded-xl border bg-white overflow-hidden hover:shadow-lg transition-shadow"
            >
              {/* Header vermelho com ícone/foto */}
              <div className="bg-gradient-to-br from-[#7f1010] to-[#a31414] text-white p-4 relative">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedGroup(group);
                    setEditGroupName(group.name);
                    setEditGroupPhotoFileId(group.photo_file_id || null);
                    setShowSettingsModal(true);
                    setSettingsTab('general');
                  }}
                  className="absolute top-2 right-2 p-1.5 rounded hover:bg-white/20 transition-colors"
                  title="Group Settings"
                >
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </button>
                <div className="flex items-center gap-3">
                  <div className="w-16 h-16 rounded-lg bg-white/20 flex items-center justify-center flex-shrink-0 overflow-hidden">
                    {group.photo_file_id ? (
                      <img
                        src={`/files/${group.photo_file_id}/thumbnail?w=64`}
                        alt={group.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <img
                        src="/ui/assets/login/logo-light.svg"
                        alt="Mack Kirk"
                        className="w-12 h-12 object-contain"
                      />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm truncate">Community Group</div>
                  </div>
                </div>
              </div>

              {/* Body do card */}
              <div className="p-4">
                <h3 className="font-bold text-lg text-gray-900 mb-2">{group.name}</h3>
                {group.description && (
                  <p className="text-sm text-gray-600 mb-3 line-clamp-2">{group.description}</p>
                )}
                <div className="text-xs text-gray-500 mb-4">
                  {group.member_count || 0} member{group.member_count !== 1 ? 's' : ''}
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleManageMembers(group);
                  }}
                  className="w-full px-4 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 transition text-sm font-medium"
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
            
            {/* Search field */}
            <div>
              <input
                type="text"
                placeholder="Search employees..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm"
              />
            </div>

            {/* Select All button */}
            <div className="flex justify-between items-center">
              <button
                onClick={() => {
                  const filtered = getFilteredEmployees();
                  if (selectedMembers.length === filtered.length && filtered.length > 0) {
                    // Deselect all
                    setSelectedMembers([]);
                  } else {
                    // Select all filtered
                    setSelectedMembers(filtered.map(e => e.id));
                  }
                }}
                className="text-sm text-brand-red hover:underline"
              >
                {selectedMembers.length === getFilteredEmployees().length && getFilteredEmployees().length > 0
                  ? 'Deselect All'
                  : 'Select All'}
              </button>
              <span className="text-xs text-gray-500">
                {selectedMembers.length} selected
              </span>
            </div>

            <div className="max-h-80 overflow-y-auto border rounded-lg p-3 space-y-2">
              {getFilteredEmployees().length === 0 ? (
                <div className="text-sm text-gray-500">No employees found.</div>
              ) : (
                getFilteredEmployees().map((employee) => (
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

      {/* Group Settings Modal */}
      {showSettingsModal && selectedGroup && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-6 border-b">
              <h2 className="text-xl font-semibold">Group Settings</h2>
            </div>

            {/* Tabs */}
            <div className="flex border-b bg-gray-50">
              <button
                onClick={() => setSettingsTab('general')}
                className={`px-6 py-3 font-medium transition-colors ${
                  settingsTab === 'general'
                    ? 'bg-white text-brand-red border-b-2 border-brand-red'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                General
              </button>
              <button
                onClick={() => setSettingsTab('topics')}
                className={`px-6 py-3 font-medium transition-colors ${
                  settingsTab === 'topics'
                    ? 'bg-white text-brand-red border-b-2 border-brand-red'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Topics
              </button>
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {settingsTab === 'general' ? (
                <div className="space-y-6">
                  {/* Name */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={editGroupName}
                      onChange={(e) => setEditGroupName(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-4 py-2"
                    />
                  </div>

                  {/* Group Avatar */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Group Avatar
                    </label>
                    <div className="flex items-center gap-4">
                      <div className="w-24 h-24 rounded-lg bg-gray-100 border-2 border-gray-300 flex items-center justify-center overflow-hidden">
                        {editGroupPhotoFileId ? (
                          <img
                            src={`/files/${editGroupPhotoFileId}/thumbnail?w=96`}
                            alt="Group avatar"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <img
                            src="/ui/assets/login/logo-light.svg"
                            alt="Mack Kirk"
                            className="w-16 h-16 object-contain"
                          />
                        )}
                      </div>
                      <button
                        onClick={() => setShowImagePicker(true)}
                        className="px-4 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 transition flex items-center gap-2"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                        </svg>
                        Upload Image
                      </button>
                    </div>
                  </div>

                  {/* Send posts to members checkbox */}
                  <div className="flex items-start gap-3 pt-4 border-t">
                    <input
                      type="checkbox"
                      id="send-posts-to-members"
                      disabled
                      className="mt-1 w-4 h-4 rounded border-gray-300 text-brand-red focus:ring-brand-red disabled:opacity-50"
                    />
                    <div className="flex-1">
                      <label htmlFor="send-posts-to-members" className="block text-sm font-medium text-gray-700">
                        Send posts to members
                      </label>
                      <p className="text-xs text-gray-500 mt-1">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-yellow-100 text-yellow-800 border border-yellow-300">
                          [WIP]
                        </span>
                        This feature is currently in development
                      </p>
                    </div>
                  </div>

                  {/* Delete Group */}
                  <div className="pt-4 border-t">
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h3 className="text-sm font-semibold text-red-900 mb-1">Delete Group</h3>
                          <p className="text-xs text-red-700">
                            This action cannot be undone. All topics and member associations will be removed.
                          </p>
                        </div>
                        <button
                          onClick={async () => {
                            if (!selectedGroup) return;
                            const result = await confirm({
                              title: 'Delete Group',
                              message: `Are you sure you want to delete "${selectedGroup.name}"? This action cannot be undone. All topics and member associations will be removed.`,
                              confirmText: 'Delete',
                              cancelText: 'Cancel',
                            });
                            if (result !== 'confirm') return;
                            try {
                              await api('DELETE', `/community/groups/${selectedGroup.id}`);
                              toast.success('Group deleted successfully');
                              queryClient.invalidateQueries({ queryKey: ['community-groups'] });
                              setShowSettingsModal(false);
                              setSelectedGroup(null);
                            } catch (err: any) {
                              toast.error(err?.response?.data?.detail || 'Failed to delete group');
                            }
                          }}
                          className="ml-4 px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 transition text-sm font-medium"
                        >
                          Delete Group
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Create Topic */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Create a Topic
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newTopicName}
                        onChange={(e) => setNewTopicName(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleCreateTopic()}
                        placeholder="Topic Name"
                        className="flex-1 rounded-lg border border-gray-300 px-4 py-2"
                      />
                      <button
                        onClick={handleCreateTopic}
                        disabled={!newTopicName.trim()}
                        className="px-4 py-2 rounded-lg border border-gray-300 bg-gray-100 text-gray-700 hover:bg-gray-200 transition disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Create Topic
                      </button>
                    </div>
                  </div>

                  {/* Topics List */}
                  <div className="border-t pt-4">
                    <div className="space-y-2">
                      {topics.length === 0 ? (
                        <p className="text-sm text-gray-500">No topics created yet.</p>
                      ) : (
                        topics.map((topic) => {
                          const isMainTopic = topic.name === 'General';
                          const isRenaming = renameTopicId === topic.id;
                          return (
                            <div key={topic.id} className="flex items-center justify-between py-2 border-b relative">
                              <div className="flex-1">
                                {isMainTopic && (
                                  <div className="text-xs text-gray-500 mb-1">Main Topic</div>
                                )}
                                {isRenaming ? (
                                  <div className="flex items-center gap-2">
                                    <input
                                      type="text"
                                      value={renameTopicName}
                                      onChange={(e) => setRenameTopicName(e.target.value)}
                                      onKeyPress={(e) => {
                                        if (e.key === 'Enter') {
                                          handleRenameTopic();
                                        } else if (e.key === 'Escape') {
                                          setRenameTopicId(null);
                                          setRenameTopicName('');
                                        }
                                      }}
                                      className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
                                      autoFocus
                                    />
                                    <button
                                      onClick={handleRenameTopic}
                                      className="px-3 py-1.5 rounded-lg bg-brand-red text-white hover:bg-red-700 transition text-sm"
                                    >
                                      Save
                                    </button>
                                    <button
                                      onClick={() => {
                                        setRenameTopicId(null);
                                        setRenameTopicName('');
                                      }}
                                      className="px-3 py-1.5 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 transition text-sm"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                ) : (
                                  <>
                                    <div className="font-semibold text-gray-900">{topic.name}</div>
                                    {topic.posts_count !== undefined && (
                                      <div className="text-xs text-gray-500 mt-1">
                                        {topic.posts_count} Post{topic.posts_count !== 1 ? 's' : ''}
                                      </div>
                                    )}
                                  </>
                                )}
                              </div>
                              {!isRenaming && (
                                <div className="flex items-center gap-2 relative">
                                  <button
                                    ref={(el) => {
                                      if (el) menuButtonRefs.current[topic.id] = el;
                                    }}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const buttonEl = menuButtonRefs.current[topic.id];
                                      if (buttonEl) {
                                        const rect = buttonEl.getBoundingClientRect();
                                        setMenuPosition({
                                          top: rect.bottom + 8,
                                          right: window.innerWidth - rect.right,
                                        });
                                      }
                                      setOpenMenuId(openMenuId === topic.id ? null : topic.id);
                                    }}
                                    className="p-1 rounded hover:bg-gray-100"
                                  >
                                    <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                                    </svg>
                                  </button>
                                  {openMenuId === topic.id && menuPosition && (
                                    <>
                                      <div
                                        className="fixed inset-0 z-[100]"
                                        onClick={() => {
                                          setOpenMenuId(null);
                                          setMenuPosition(null);
                                        }}
                                      />
                                      <div 
                                        className="fixed z-[110] bg-white rounded-lg shadow-lg border border-gray-200 py-1 min-w-[160px]"
                                        style={{
                                          top: `${menuPosition.top}px`,
                                          right: `${menuPosition.right}px`,
                                        }}
                                      >
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setRenameTopicId(topic.id);
                                            setRenameTopicName(topic.name);
                                            setOpenMenuId(null);
                                            setMenuPosition(null);
                                          }}
                                          className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                                        >
                                          Rename...
                                        </button>
                                      </div>
                                    </>
                                  )}
                                  {!isMainTopic && (
                                    <button
                                      onClick={async () => {
                                        if (!selectedGroup) return;
                                        const result = await confirm({
                                          title: 'Delete Topic',
                                          message: `Are you sure you want to delete "${topic.name}"? This action cannot be undone.`,
                                          confirmText: 'Delete',
                                          cancelText: 'Cancel',
                                        });
                                        if (result !== 'confirm') return;
                                        try {
                                          await api('DELETE', `/community/groups/${selectedGroup.id}/topics/${topic.id}`);
                                          toast.success('Topic deleted successfully');
                                          queryClient.invalidateQueries({ queryKey: ['group-topics', selectedGroup.id] });
                                        } catch (err: any) {
                                          toast.error(err?.response?.data?.detail || 'Failed to delete topic');
                                        }
                                      }}
                                      className="p-1 rounded hover:bg-gray-100 text-red-600"
                                    >
                                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                      </svg>
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-6 border-t flex justify-end gap-3 relative z-10">
              <button
                onClick={() => {
              setShowSettingsModal(false);
              setEditGroupName('');
              setEditGroupPhotoFileId(null);
              setOpenMenuId(null);
              setRenameTopicId(null);
              setRenameTopicName('');
            }}
            className="px-4 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 transition"
          >
            Cancel
          </button>
              <button
                onClick={async () => {
                  if (!selectedGroup) return;
                  try {
                    await api('PUT', `/community/groups/${selectedGroup.id}`, {
                      name: editGroupName.trim(),
                      photo_file_id: editGroupPhotoFileId || null,
                    });
                    toast.success('Settings saved successfully');
                    queryClient.invalidateQueries({ queryKey: ['community-groups'] });
                    queryClient.invalidateQueries({ queryKey: ['community-group', selectedGroup.id] });
                    setShowSettingsModal(false);
                  } catch (err: any) {
                    toast.error(err?.response?.data?.detail || 'Failed to save settings');
                  }
                }}
                className="px-4 py-2 rounded-lg bg-brand-red text-white hover:bg-red-700 transition"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Image Picker */}
      <ImagePicker
        isOpen={showImagePicker}
        onClose={() => setShowImagePicker(false)}
        onConfirm={handleImageConfirm}
        targetWidth={256}
        targetHeight={256}
        allowEdit={true}
      />
    </div>
  );
}

