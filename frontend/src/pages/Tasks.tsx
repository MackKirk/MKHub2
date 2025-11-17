import { useState, useMemo, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import { useConfirm } from '@/components/ConfirmProvider';

type Task = {
  id: string;
  title: string;
  description?: string;
  status: 'todo' | 'in_progress' | 'waiting' | 'done';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  project_id?: string;
  project_name?: string;
  project_code?: string;
  division_id?: string;
  assigned_to?: string;
  assigned_to_name?: string;
  assigned_to_users?: string[];
  assigned_to_users_names?: string[];
  due_date?: string;
  category: string;
  origin_source?: string;
  created_at: string;
  comments?: Comment[];
};

type Comment = {
  id: string;
  user_id: string;
  user_name?: string;
  text: string;
  created_at: string;
};

// Helper function to format dates
const formatDate = (dateStr?: string) => {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

export default function Tasks() {
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [filters, setFilters] = useState<{
    status?: string;
    assigned_to?: string;
    category?: string;
    overdue_only?: boolean;
    project_id?: string;
  }>({});

  const { data: tasks = [], refetch } = useQuery<Task[]>({
    queryKey: ['tasks', filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.status) params.set('status', filters.status);
      if (filters.assigned_to) params.set('assigned_to', filters.assigned_to);
      if (filters.category) params.set('category', filters.category);
      if (filters.overdue_only) params.set('overdue_only', 'true');
      if (filters.project_id) params.set('project_id', filters.project_id);
      const query = params.toString();
      return api<Task[]>('GET', `/tasks${query ? `?${query}` : ''}`);
    }
  });

  const { data: employees = [] } = useQuery<any[]>({
    queryKey: ['employees'],
    queryFn: () => api<any[]>('GET', '/employees')
  });

  const { data: projects = [] } = useQuery<any[]>({
    queryKey: ['projects'],
    queryFn: () => api<any[]>('GET', '/projects')
  });

  const { data: settings } = useQuery({
    queryKey: ['settings-bundle'],
    queryFn: () => api<Record<string, any[]>>('GET', '/settings')
  });

  const divisions = useMemo(() => {
    return (settings?.divisions || []) as any[];
  }, [settings]);

  // Group tasks by status for Kanban
  const tasksByStatus = useMemo(() => {
    const grouped: Record<string, Task[]> = {
      todo: [],
      in_progress: [],
      waiting: [],
      done: []
    };
    tasks.forEach(task => {
      const status = task.status || 'todo';
      if (grouped[status]) {
        grouped[status].push(task);
      }
    });
    return grouped;
  }, [tasks]);

  const handleStatusChange = async (taskId: string, newStatus: string) => {
    try {
      await api('PATCH', `/tasks/${taskId}/status`, { status: newStatus });
      await refetch();
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to update task status');
    }
  };

  const handleCreateTask = async (taskData: any) => {
    try {
      await api('POST', '/tasks', {
        ...taskData,
        category: 'manual',
        status: 'todo'
      });
      toast.success('Task created successfully');
      setShowCreateModal(false);
      await refetch();
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to create task');
    }
  };

  const handleClearAllTasks = async () => {
    const ok = await confirm({
      title: 'Clear All Tasks',
      message: 'Are you sure you want to delete ALL tasks? This action cannot be undone. This is a development/testing feature.',
      confirmText: 'Delete All',
      cancelText: 'Cancel',
    });
    
    if (!ok) return;
    
    try {
      const result = await api('DELETE', '/tasks/all');
      toast.success(`Deleted ${result.deleted || 0} task(s)`);
      await refetch();
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to delete tasks');
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'bg-red-100 text-red-800 border-red-300';
      case 'high': return 'bg-orange-100 text-orange-800 border-orange-300';
      case 'normal': return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'low': return 'bg-gray-100 text-gray-800 border-gray-300';
      default: return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'order': return '📦';
      case 'attendance': return '⏰';
      case 'dispatch': return '🚗';
      case 'manual': return '📝';
      default: return '📋';
    }
  };

  const isOverdue = (dueDate?: string) => {
    if (!dueDate) return false;
    return new Date(dueDate) < new Date() && new Date(dueDate).toDateString() !== new Date().toDateString();
  };

  const renderTaskCard = (task: Task) => {
    const overdue = isOverdue(task.due_date);
    return (
      <div
        key={task.id}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData('taskId', task.id);
          e.dataTransfer.setData('currentStatus', task.status);
        }}
        onClick={() => setSelectedTask(task)}
        className="p-3 bg-white border rounded-lg cursor-pointer hover:shadow-md transition-shadow mb-2"
      >
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm">{getCategoryIcon(task.category)}</span>
              <h4 className="font-medium text-sm text-gray-900 truncate">{task.title}</h4>
            </div>
            {task.assigned_to_users_names && task.assigned_to_users_names.length > 0 && (
              <div className="text-xs text-gray-600 mb-1">
                👤 {task.assigned_to_users_names.join(', ')}
              </div>
            )}
            {task.assigned_to_name && (
              <div className="text-xs text-gray-600 mb-1">
                👤 {task.assigned_to_name}
              </div>
            )}
            {task.due_date && (
              <div className={`text-xs ${overdue ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>
                📅 {formatDate(task.due_date)} {overdue && '(Overdue)'}
              </div>
            )}
            {task.project_name && (
              <div className="text-xs text-gray-500">
                📁 {task.project_code || ''} {task.project_name}
              </div>
            )}
          </div>
          <span className={`px-2 py-0.5 rounded text-xs border ${getPriorityColor(task.priority)}`}>
            {task.priority}
          </span>
        </div>
        {task.origin_source && (
          <div className="text-xs text-gray-500 mt-1">
            {task.origin_source}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header with filters and create button */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h2 className="text-2xl font-bold">Tasks</h2>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Filters */}
          <select
            value={filters.status || ''}
            onChange={(e) => setFilters({ ...filters, status: e.target.value || undefined })}
            className="px-3 py-2 border rounded text-sm"
          >
            <option value="">All Status</option>
            <option value="todo">To Do</option>
            <option value="in_progress">In Progress</option>
            <option value="waiting">Waiting</option>
            <option value="done">Done</option>
          </select>
          
          <select
            value={filters.project_id || ''}
            onChange={(e) => setFilters({ ...filters, project_id: e.target.value || undefined })}
            className="px-3 py-2 border rounded text-sm"
          >
            <option value="">All Projects</option>
            {projects.map((proj: any) => (
              <option key={proj.id} value={proj.id}>
                {proj.code || ''} {proj.name || ''}
              </option>
            ))}
          </select>
          
          <select
            value={filters.category || ''}
            onChange={(e) => setFilters({ ...filters, category: e.target.value || undefined })}
            className="px-3 py-2 border rounded text-sm"
          >
            <option value="">All Categories</option>
            <option value="manual">Manual</option>
            <option value="order">Order</option>
            <option value="attendance">Attendance</option>
            <option value="dispatch">Dispatch</option>
          </select>
          
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={filters.overdue_only || false}
              onChange={(e) => setFilters({ ...filters, overdue_only: e.target.checked || undefined })}
              className="rounded"
            />
            Overdue Only
          </label>
          
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 rounded bg-brand-red text-white text-sm hover:bg-red-700 transition-colors"
          >
            + Create Task
          </button>
          <button
            onClick={handleClearAllTasks}
            className="px-4 py-2 rounded bg-orange-600 text-white text-sm hover:bg-orange-700 transition-colors"
            title="Development/Testing: Delete all tasks"
          >
            🗑️ Clear All Tasks
          </button>
        </div>
      </div>

      {/* Kanban Board */}
      <div className="grid grid-cols-4 gap-4">
        {['todo', 'in_progress', 'waiting', 'done'].map((status) => (
          <div
            key={status}
            className="rounded-xl border bg-gray-50 p-4"
            onDragOver={(e) => {
              e.preventDefault();
              e.currentTarget.style.backgroundColor = '#f3f4f6';
            }}
            onDragLeave={(e) => {
              e.currentTarget.style.backgroundColor = '';
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.currentTarget.style.backgroundColor = '';
              const taskId = e.dataTransfer.getData('taskId');
              const currentStatus = e.dataTransfer.getData('currentStatus');
              if (taskId && currentStatus !== status) {
                handleStatusChange(taskId, status);
              }
            }}
          >
            <h3 className="font-semibold text-gray-700 mb-3 capitalize">
              {status.replace('_', ' ')} ({tasksByStatus[status]?.length || 0})
            </h3>
            <div className="space-y-2 min-h-[200px]">
              {tasksByStatus[status]?.map(renderTaskCard)}
            </div>
          </div>
        ))}
      </div>

      {/* Task Detail Modal */}
      {selectedTask && (
        <TaskDetailModal
          task={selectedTask}
          employees={employees}
          projects={projects}
          onClose={() => setSelectedTask(null)}
          onUpdate={async () => {
            await refetch();
            queryClient.invalidateQueries({ queryKey: ['tasks'] });
          }}
        />
      )}

      {/* Create Task Modal */}
      {showCreateModal && (
        <CreateTaskModal
          employees={employees}
          projects={projects}
          divisions={divisions}
          onClose={() => setShowCreateModal(false)}
          onCreate={handleCreateTask}
        />
      )}
    </div>
  );
}

// Task Detail Modal Component
function TaskDetailModal({
  task,
  employees,
  projects,
  onClose,
  onUpdate
}: {
  task: Task;
  employees: any[];
  projects: any[];
  onClose: () => void;
  onUpdate: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description || '');
  const [priority, setPriority] = useState(task.priority);
  const [assignedTo, setAssignedTo] = useState(task.assigned_to || '');
  const [dueDate, setDueDate] = useState(task.due_date ? task.due_date.split('T')[0] : '');
  const [status, setStatus] = useState(task.status);
  const [projectId, setProjectId] = useState(task.project_id || '');
  const [newComment, setNewComment] = useState('');
  const [comments, setComments] = useState<Comment[]>(task.comments || []);

  // Fetch full task details when modal opens
  const { data: fullTask, refetch: refetchTask } = useQuery<Task>({
    queryKey: ['task', task.id],
    queryFn: () => api<Task>('GET', `/tasks/${task.id}`),
    enabled: !!task.id
  });

  useEffect(() => {
    if (fullTask) {
      setComments(fullTask.comments || []);
    }
  }, [fullTask]);

  const handleUpdate = async () => {
    try {
      await api('PATCH', `/tasks/${task.id}`, {
        title,
        description,
        priority,
        assigned_to: assignedTo || null,
        due_date: dueDate ? `${dueDate}T00:00:00Z` : null,
        status,
        project_id: projectId || null
      });
      toast.success('Task updated successfully');
      setEditing(false);
      await onUpdate();
      await refetchTask();
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to update task');
    }
  };

  const handleAddComment = async () => {
    if (!newComment.trim()) return;
    try {
      const result = await api('POST', `/tasks/${task.id}/comments`, { text: newComment });
      setComments([...comments, result]);
      setNewComment('');
      await onUpdate();
      await refetchTask();
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to add comment');
    }
  };

  const displayTask = fullTask || task;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="w-[800px] max-w-[95vw] bg-white rounded-xl overflow-hidden max-h-[90vh] flex flex-col">
        <div className="bg-gradient-to-br from-[#7f1010] to-[#a31414] p-6 flex items-center gap-6 relative flex-shrink-0">
          <div className="font-semibold text-lg text-white">Task Details</div>
          <button
            onClick={onClose}
            className="ml-auto text-white hover:text-gray-200 text-2xl font-bold w-8 h-8 flex items-center justify-center rounded hover:bg-white/20"
            title="Close"
          >
            ×
          </button>
        </div>
        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          {editing ? (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full border rounded px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                  className="w-full border rounded px-3 py-2"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as any)}
                    className="w-full border rounded px-3 py-2"
                  >
                    <option value="low">Low</option>
                    <option value="normal">Normal</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as any)}
                    className="w-full border rounded px-3 py-2"
                  >
                    <option value="todo">To Do</option>
                    <option value="in_progress">In Progress</option>
                    <option value="waiting">Waiting</option>
                    <option value="done">Done</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Assigned To</label>
                  <select
                    value={assignedTo}
                    onChange={(e) => setAssignedTo(e.target.value)}
                    className="w-full border rounded px-3 py-2"
                  >
                    <option value="">Unassigned</option>
                    {employees.map((emp: any) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.name || emp.username}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="w-full border rounded px-3 py-2"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Project</label>
                <select
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  className="w-full border rounded px-3 py-2"
                >
                  <option value="">Unassigned</option>
                  {projects.map((proj: any) => (
                    <option key={proj.id} value={proj.id}>
                      {proj.code || ''} {proj.name || ''}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleUpdate}
                  className="px-4 py-2 rounded bg-brand-red text-white hover:bg-red-700"
                >
                  Save
                </button>
                <button
                  onClick={() => {
                    setEditing(false);
                    setTitle(displayTask.title);
                    setDescription(displayTask.description || '');
                    setPriority(displayTask.priority);
                    setAssignedTo(displayTask.assigned_to || '');
                    setDueDate(displayTask.due_date ? displayTask.due_date.split('T')[0] : '');
                    setStatus(displayTask.status);
                    setProjectId(displayTask.project_id || '');
                  }}
                  className="px-4 py-2 rounded bg-gray-200 hover:bg-gray-300"
                >
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h3 className="text-xl font-semibold mb-2">{displayTask.title}</h3>
                  {displayTask.description && (
                    <p className="text-gray-600 mb-4">{displayTask.description}</p>
                  )}
                </div>
                <button
                  onClick={() => setEditing(true)}
                  className="px-3 py-1 rounded bg-gray-200 hover:bg-gray-300 text-sm"
                >
                  Edit
                </button>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="font-medium">Status:</span> {displayTask.status.replace('_', ' ')}
                </div>
                <div>
                  <span className="font-medium">Priority:</span> {displayTask.priority}
                </div>
                <div>
                  <span className="font-medium">Assigned To:</span> {
                    displayTask.assigned_to_users_names && displayTask.assigned_to_users_names.length > 0
                      ? displayTask.assigned_to_users_names.join(', ')
                      : displayTask.assigned_to_name || 'Unassigned'
                  }
                </div>
                <div>
                  <span className="font-medium">Due Date:</span> {displayTask.due_date ? formatDate(displayTask.due_date) : 'No due date'}
                </div>
                <div>
                  <span className="font-medium">Category:</span> {displayTask.category}
                </div>
                {displayTask.project_name && (
                  <div>
                    <span className="font-medium">Project:</span> {displayTask.project_code || ''} {displayTask.project_name}
                  </div>
                )}
                {displayTask.origin_source && (
                  <div>
                    <span className="font-medium">Origin:</span> {displayTask.origin_source}
                  </div>
                )}
              </div>

              {/* Comments */}
              <div className="border-t pt-4">
                <h4 className="font-semibold mb-2">Comments</h4>
                <div className="space-y-3 mb-3 max-h-40 overflow-y-auto">
                  {comments.map((comment) => (
                    <div key={comment.id} className="bg-gray-50 p-2 rounded">
                      <div className="text-xs text-gray-600 mb-1">
                        {comment.user_name || 'User'} • {formatDate(comment.created_at)}
                      </div>
                      <div className="text-sm">{comment.text}</div>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <textarea
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    placeholder="Add a comment..."
                    rows={2}
                    className="flex-1 border rounded px-3 py-2 text-sm"
                  />
                  <button
                    onClick={handleAddComment}
                    className="px-3 py-2 rounded bg-gray-200 hover:bg-gray-300 text-sm self-end"
                  >
                    Add
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
        {/* Footer with Review Attendance button for attendance tasks */}
        {!editing && displayTask.category === 'attendance' && displayTask.project_id && (
          <div className="border-t p-4 flex justify-end">
            <ReviewAttendanceButton projectId={displayTask.project_id} />
          </div>
        )}
      </div>
    </div>
  );
}

// Create Task Modal Component with User/Division selection
function CreateTaskModal({
  employees,
  projects,
  divisions,
  onClose,
  onCreate
}: {
  employees: any[];
  projects: any[];
  divisions: any[];
  onClose: () => void;
  onCreate: (data: any) => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('normal');
  const [dueDate, setDueDate] = useState('');
  const [projectId, setProjectId] = useState('');
  const [assignType, setAssignType] = useState<'user' | 'division'>('user');
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [selectedDivision, setSelectedDivision] = useState('');
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const userDropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userDropdownRef.current && !userDropdownRef.current.contains(event.target as Node)) {
        setUserDropdownOpen(false);
      }
    };

    if (userDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [userDropdownOpen]);

  // Filter employees by search
  const filteredEmployees = useMemo(() => {
    if (!employees || !Array.isArray(employees)) return [];
    if (!userSearch) return employees;
    const searchLower = userSearch.toLowerCase();
    return employees.filter((emp: any) => {
      const name = (emp.name || emp.username || '').toLowerCase();
      return name.includes(searchLower);
    });
  }, [employees, userSearch]);

  const toggleUser = (userId: string) => {
    setSelectedUsers((prev) => {
      const prevArray = Array.isArray(prev) ? prev : [];
      return prevArray.includes(userId) 
        ? prevArray.filter((id) => id !== userId) 
        : [...prevArray, userId];
    });
  };

  const handleSubmit = () => {
    if (!title.trim()) {
      toast.error('Title is required');
      return;
    }

    const taskData: any = {
      title,
      description,
      priority,
      due_date: dueDate ? `${dueDate}T00:00:00Z` : null,
      project_id: projectId || null
    };

    if (assignType === 'user') {
      if (selectedUsers.length > 0) {
        taskData.assigned_to_users = selectedUsers;
      }
    } else if (assignType === 'division') {
      if (selectedDivision) {
        taskData.division_id = selectedDivision;
      }
    }

    onCreate(taskData);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="w-[600px] max-w-[95vw] bg-white rounded-xl overflow-hidden max-h-[90vh] flex flex-col">
        <div className="bg-gradient-to-br from-[#7f1010] to-[#a31414] p-6 flex items-center gap-6 relative flex-shrink-0">
          <div className="font-semibold text-lg text-white">Create Task</div>
          <button
            onClick={onClose}
            className="ml-auto text-white hover:text-gray-200 text-2xl font-bold w-8 h-8 flex items-center justify-center rounded hover:bg-white/20"
            title="Close"
          >
            ×
          </button>
        </div>
        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full border rounded px-3 py-2"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className="w-full border rounded px-3 py-2"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="w-full border rounded px-3 py-2"
              >
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full border rounded px-3 py-2"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Project (Optional)</label>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="w-full border rounded px-3 py-2"
            >
              <option value="">Unassigned</option>
              {projects.map((proj: any) => (
                <option key={proj.id} value={proj.id}>
                  {proj.code || ''} {proj.name || ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Assign To</label>
            <div className="flex items-center gap-4 mb-2">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="assignType"
                  checked={assignType === 'user'}
                  onChange={() => setAssignType('user')}
                />
                <span className="text-sm">User</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="assignType"
                  checked={assignType === 'division'}
                  onChange={() => setAssignType('division')}
                />
                <span className="text-sm">Division</span>
              </label>
            </div>
            {assignType === 'user' ? (
              <div className="relative" ref={userDropdownRef}>
                <button
                  type="button"
                  onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                  className="w-full border rounded px-3 py-2 text-left bg-white flex items-center justify-between"
                >
                  <span className="text-sm text-gray-600">
                    {selectedUsers.length === 0
                      ? 'Select users...'
                      : `${selectedUsers.length} user${selectedUsers.length > 1 ? 's' : ''} selected`}
                  </span>
                  <span className="text-gray-400">{userDropdownOpen ? '▲' : '▼'}</span>
                </button>
                {userDropdownOpen && (
                  <div 
                    className="absolute z-50 mt-1 w-full rounded-lg border bg-white shadow-lg max-h-60 overflow-auto"
                    onMouseDown={(e) => e.stopPropagation()}
                  >
                    <div className="p-2 border-b space-y-2">
                      <input
                        type="text"
                        placeholder="Search users..."
                        value={userSearch}
                        onChange={(e) => setUserSearch(e.target.value)}
                        className="w-full border rounded px-2 py-1 text-sm"
                        onMouseDown={(e) => e.stopPropagation()}
                      />
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (!Array.isArray(filteredEmployees)) return;
                            const allFilteredIds = filteredEmployees.map((e: any) => e.id);
                            setSelectedUsers((prev) => {
                              const prevArray = Array.isArray(prev) ? prev : [];
                              const newSet = new Set([...prevArray, ...allFilteredIds]);
                              return Array.from(newSet);
                            });
                          }}
                          className="text-xs px-2 py-1 rounded border hover:bg-gray-50"
                        >
                          Select All
                        </button>
                        <button
                          type="button"
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setSelectedUsers([]);
                          }}
                          className="text-xs px-2 py-1 rounded border hover:bg-gray-50"
                        >
                          Clear All
                        </button>
                      </div>
                    </div>
                    <div className="p-2">
                      {(Array.isArray(filteredEmployees) && filteredEmployees.length > 0) ? (
                        filteredEmployees.map((emp: any) => (
                          <label
                            key={emp.id}
                            className="flex items-center gap-2 p-2 hover:bg-gray-50 cursor-pointer rounded"
                            onMouseDown={(e) => e.stopPropagation()}
                          >
                            <input
                              type="checkbox"
                              checked={Array.isArray(selectedUsers) && selectedUsers.includes(emp.id)}
                              onChange={() => toggleUser(emp.id)}
                              className="rounded"
                              onMouseDown={(e) => e.stopPropagation()}
                            />
                            <div className="flex items-center gap-2 flex-1">
                              {emp.profile_photo_file_id ? (
                                <img
                                  src={`/files/${emp.profile_photo_file_id}/thumbnail?w=64`}
                                  className="w-6 h-6 rounded-full object-cover"
                                  alt=""
                                />
                              ) : (
                                <span className="w-6 h-6 rounded-full bg-gray-200 inline-block" />
                              )}
                              <span className="text-sm">{emp.name || emp.username}</span>
                            </div>
                          </label>
                        ))
                      ) : (
                        <div className="p-2 text-sm text-gray-600">No users found</div>
                      )}
                    </div>
                  </div>
                )}
                {selectedUsers.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {selectedUsers.map((userId) => {
                      const user = (Array.isArray(employees) ? employees : []).find((e: any) => e.id === userId);
                      return (
                        <span
                          key={userId}
                          className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-800 rounded text-sm"
                        >
                          {user?.name || user?.username || userId}
                          <button
                            type="button"
                            onClick={() => toggleUser(userId)}
                            className="text-blue-600 hover:text-blue-800"
                          >
                            ×
                          </button>
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              <select
                value={selectedDivision}
                onChange={(e) => setSelectedDivision(e.target.value)}
                className="w-full border rounded px-3 py-2"
              >
                <option value="">Select Division</option>
                {divisions.map((div: any) => (
                  <option key={div.id} value={div.id}>
                    {div.label || div.value}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className="flex gap-2 justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded bg-gray-200 hover:bg-gray-300"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              className="px-4 py-2 rounded bg-brand-red text-white hover:bg-red-700"
            >
              Create
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Review Attendance Button Component
function ReviewAttendanceButton({ projectId }: { projectId: string }) {
  const navigate = useNavigate();
  
  const handleReview = () => {
    navigate(`/projects/${projectId}?tab=dispatch&subtab=pending`);
  };
  
  return (
    <button
      onClick={handleReview}
      className="px-4 py-2 rounded bg-green-600 text-white text-sm hover:bg-green-700 transition-colors"
    >
      Review Attendance
    </button>
  );
}

