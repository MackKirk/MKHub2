import { useState, useMemo } from 'react';
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

export default function MyTasks() {
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [viewMode, setViewMode] = useState<'list' | 'board'>('list');
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [filters, setFilters] = useState<{
    status?: string;
    category?: string;
    overdue_only?: boolean;
  }>({});

  // Fetch personal tasks
  const { data: personalTasks = [], refetch: refetchPersonal } = useQuery<Task[]>({
    queryKey: ['myTasks', 'personal', filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('task_type', 'personal');
      if (filters.status) params.set('status', filters.status);
      if (filters.category) params.set('category', filters.category);
      if (filters.overdue_only) params.set('overdue_only', 'true');
      const query = params.toString();
      return api<Task[]>('GET', `/tasks/me/tasks?${query}`);
    }
  });

  // Fetch division tasks
  const { data: divisionTasks = [], refetch: refetchDivision } = useQuery<Task[]>({
    queryKey: ['myTasks', 'division', filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('task_type', 'division');
      if (filters.status) params.set('status', filters.status);
      if (filters.category) params.set('category', filters.category);
      if (filters.overdue_only) params.set('overdue_only', 'true');
      const query = params.toString();
      return api<Task[]>('GET', `/tasks/me/tasks?${query}`);
    }
  });

  const refetch = async () => {
    await refetchPersonal();
    await refetchDivision();
  };

  const { data: employees = [] } = useQuery<any[]>({
    queryKey: ['employees'],
    queryFn: () => api<any[]>('GET', '/employees')
  });

  const { data: projects = [] } = useQuery<any[]>({
    queryKey: ['projects'],
    queryFn: () => api<any[]>('GET', '/projects')
  });

  // Group personal tasks by status for Kanban
  const personalTasksByStatus = useMemo(() => {
    const grouped: Record<string, Task[]> = {
      todo: [],
      in_progress: [],
      waiting: [],
      done: []
    };
    personalTasks.forEach(task => {
      const status = task.status || 'todo';
      if (grouped[status]) {
        grouped[status].push(task);
      }
    });
    return grouped;
  }, [personalTasks]);

  // Group division tasks by status for Kanban
  const divisionTasksByStatus = useMemo(() => {
    const grouped: Record<string, Task[]> = {
      todo: [],
      in_progress: [],
      waiting: [],
      done: []
    };
    divisionTasks.forEach(task => {
      const status = task.status || 'todo';
      if (grouped[status]) {
        grouped[status].push(task);
      }
    });
    return grouped;
  }, [divisionTasks]);

  const handleStatusChange = async (taskId: string, newStatus: string) => {
    try {
      await api('PATCH', `/tasks/${taskId}/status`, { status: newStatus });
      await refetch();
      queryClient.invalidateQueries({ queryKey: ['myTasks'] });
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to update task status');
    }
  };

  const handleMarkDone = async (taskId: string) => {
    try {
      await api('PATCH', `/tasks/${taskId}/status`, { status: 'done' });
      toast.success('Task marked as done');
      await refetch();
      queryClient.invalidateQueries({ queryKey: ['myTasks'] });
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to update task');
    }
  };

  const handleReassign = async (taskId: string, newAssigneeId: string) => {
    try {
      await api('PATCH', `/tasks/${taskId}`, { assigned_to: newAssigneeId || null });
      toast.success('Task reassigned');
      await refetch();
      queryClient.invalidateQueries({ queryKey: ['myTasks'] });
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to reassign task');
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
      queryClient.invalidateQueries({ queryKey: ['myTasks'] });
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to create task');
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
        draggable={viewMode === 'board'}
        onDragStart={(e) => {
          if (viewMode === 'board') {
            e.dataTransfer.setData('taskId', task.id);
            e.dataTransfer.setData('currentStatus', task.status);
          }
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
            {task.project_name && (
              <div className="text-xs text-gray-600 mb-1">
                📁 {task.project_name} {task.project_code && `(${task.project_code})`}
              </div>
            )}
            {task.due_date && (
              <div className={`text-xs ${overdue ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>
                📅 {formatDate(task.due_date)} {overdue && '(Overdue)'}
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

  const renderListView = (tasksToRender: Task[]) => {
    return (
      <div className="space-y-2">
        {tasksToRender.length === 0 ? (
          <div className="text-center text-gray-500 py-8">No tasks found</div>
        ) : (
          tasksToRender.map((task) => {
            const overdue = isOverdue(task.due_date);
            return (
              <div
                key={task.id}
                className="flex items-center gap-4 p-4 bg-white border rounded-lg hover:shadow-md transition-shadow"
              >
                <input
                  type="checkbox"
                  checked={task.status === 'done'}
                  onChange={() => {
                    if (task.status === 'done') {
                      handleStatusChange(task.id, 'todo');
                    } else {
                      handleMarkDone(task.id);
                    }
                  }}
                  className="rounded"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm">{getCategoryIcon(task.category)}</span>
                    <h4 className={`font-medium ${task.status === 'done' ? 'line-through text-gray-500' : 'text-gray-900'}`}>
                      {task.title}
                    </h4>
                  </div>
                  {task.project_name && (
                    <div className="text-xs text-gray-600 mb-1">
                      📁 {task.project_name} {task.project_code && `(${task.project_code})`}
                    </div>
                  )}
                  {task.due_date && (
                    <div className={`text-xs ${overdue ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>
                      📅 {formatDate(task.due_date)} {overdue && '(Overdue)'}
                    </div>
                  )}
                  {task.origin_source && (
                    <div className="text-xs text-gray-500 mt-1">
                      {task.origin_source}
                    </div>
                  )}
                </div>
                <span className={`px-2 py-0.5 rounded text-xs border ${getPriorityColor(task.priority)}`}>
                  {task.priority}
                </span>
                <span className="px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-800 capitalize">
                  {task.status.replace('_', ' ')}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedTask(task);
                  }}
                  className="px-3 py-1 rounded bg-gray-200 hover:bg-gray-300 text-sm"
                >
                  View
                </button>
              </div>
            );
          })
        )}
      </div>
    );
  };

  const renderBoardView = (tasksByStatus: Record<string, Task[]>) => {
    return (
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
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h2 className="text-2xl font-bold">Tasks</h2>
        <div className="flex items-center gap-2 flex-wrap">
          {/* View Mode Toggle */}
          <div className="flex items-center gap-2 border rounded p-1">
            <button
              onClick={() => setViewMode('list')}
              className={`px-3 py-1 rounded text-sm transition-colors ${
                viewMode === 'list' ? 'bg-brand-red text-white' : 'bg-white text-gray-700 hover:bg-gray-100'
              }`}
            >
              List
            </button>
            <button
              onClick={() => setViewMode('board')}
              className={`px-3 py-1 rounded text-sm transition-colors ${
                viewMode === 'board' ? 'bg-brand-red text-white' : 'bg-white text-gray-700 hover:bg-gray-100'
              }`}
            >
              Board
            </button>
          </div>

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
        </div>
      </div>

      {viewMode === 'list' ? (
        /* List View: Side by side */
        <div className="grid grid-cols-2 gap-6">
          {/* Personal Tasks Section */}
          <div className="space-y-4">
            <h3 className="text-xl font-semibold text-gray-800">Personal Tasks</h3>
            {renderListView(personalTasks)}
          </div>

          {/* Division Tasks Section */}
          <div className="space-y-4">
            <h3 className="text-xl font-semibold text-gray-800">Division Tasks</h3>
            {renderListView(divisionTasks)}
          </div>
        </div>
      ) : (
        /* Board View: Stacked vertically */
        <>
          {/* Personal Tasks Section */}
          <div className="space-y-4">
            <h3 className="text-xl font-semibold text-gray-800">Personal Tasks</h3>
            {renderBoardView(personalTasksByStatus)}
          </div>

          {/* Division Tasks Section */}
          <div className="space-y-4">
            <h3 className="text-xl font-semibold text-gray-800">Division Tasks</h3>
            {renderBoardView(divisionTasksByStatus)}
          </div>
        </>
      )}

      {/* Task Detail Modal */}
      {selectedTask && (
        <MyTaskDetailModal
          task={selectedTask}
          employees={employees}
          projects={projects}
          onClose={() => setSelectedTask(null)}
          onUpdate={async () => {
            await refetch();
            queryClient.invalidateQueries({ queryKey: ['myTasks'] });
          }}
          onReassign={handleReassign}
        />
      )}

      {/* Create Task Modal */}
      {showCreateModal && (
        <CreateMyTaskModal
          employees={employees}
          projects={projects}
          onClose={() => setShowCreateModal(false)}
          onCreate={handleCreateTask}
        />
      )}
    </div>
  );
}

// My Task Detail Modal Component
function MyTaskDetailModal({
  task,
  employees,
  projects,
  onClose,
  onUpdate,
  onReassign
}: {
  task: Task;
  employees: any[];
  projects: any[];
  onClose: () => void;
  onUpdate: () => void;
  onReassign: (taskId: string, newAssigneeId: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description || '');
  const [priority, setPriority] = useState(task.priority);
  const [dueDate, setDueDate] = useState(task.due_date ? task.due_date.split('T')[0] : '');
  const [status, setStatus] = useState(task.status);
  const [newComment, setNewComment] = useState('');
  const [comments, setComments] = useState<Comment[]>(task.comments || []);
  const [reassignTo, setReassignTo] = useState('');

  const handleUpdate = async () => {
    try {
      await api('PATCH', `/tasks/${task.id}`, {
        title,
        description,
        priority,
        due_date: dueDate ? `${dueDate}T00:00:00Z` : null,
        status
      });
      toast.success('Task updated successfully');
      setEditing(false);
      await onUpdate();
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
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to add comment');
    }
  };

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
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full border rounded px-3 py-2"
                />
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
                    setTitle(task.title);
                    setDescription(task.description || '');
                    setPriority(task.priority);
                    setDueDate(task.due_date ? task.due_date.split('T')[0] : '');
                    setStatus(task.status);
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
                  <h3 className="text-xl font-semibold mb-2">{task.title}</h3>
                  {task.description && (
                    <p className="text-gray-600 mb-4">{task.description}</p>
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
                  <span className="font-medium">Status:</span> {task.status.replace('_', ' ')}
                </div>
                <div>
                  <span className="font-medium">Priority:</span> {task.priority}
                </div>
                <div>
                  <span className="font-medium">Due Date:</span> {task.due_date ? formatDate(task.due_date) : 'No due date'}
                </div>
                <div>
                  <span className="font-medium">Category:</span> {task.category}
                </div>
                {task.project_name && (
                  <div>
                    <span className="font-medium">Project:</span> {task.project_name} {task.project_code && `(${task.project_code})`}
                  </div>
                )}
                {task.origin_source && (
                  <div>
                    <span className="font-medium">Origin:</span> {task.origin_source}
                  </div>
                )}
              </div>

              {/* Reassign Task */}
              <div className="border-t pt-4">
                <h4 className="font-semibold mb-2">Reassign Task</h4>
                <div className="flex gap-2">
                  <select
                    value={reassignTo}
                    onChange={(e) => setReassignTo(e.target.value)}
                    className="flex-1 border rounded px-3 py-2"
                  >
                    <option value="">Keep assigned to me</option>
                    {employees.map((emp: any) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.name || emp.username}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => {
                      if (reassignTo) {
                        onReassign(task.id, reassignTo);
                        setReassignTo('');
                      }
                    }}
                    disabled={!reassignTo}
                    className="px-4 py-2 rounded bg-gray-200 hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Reassign
                  </button>
                </div>
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
        {!editing && task.category === 'attendance' && task.project_id && (
          <div className="border-t p-4 flex justify-end">
            <ReviewAttendanceButton projectId={task.project_id} />
          </div>
        )}
      </div>
    </div>
  );
}

// Create My Task Modal Component
function CreateMyTaskModal({
  employees,
  projects,
  onClose,
  onCreate
}: {
  employees: any[];
  projects: any[];
  onClose: () => void;
  onCreate: (data: any) => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('normal');
  const [projectId, setProjectId] = useState('');
  const [dueDate, setDueDate] = useState('');

  const handleSubmit = () => {
    if (!title.trim()) {
      toast.error('Title is required');
      return;
    }
    onCreate({
      title,
      description,
      priority,
      project_id: projectId || null,
      due_date: dueDate ? `${dueDate}T00:00:00Z` : null
    });
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
              <option value="">No project</option>
              {projects.map((proj: any) => (
                <option key={proj.id} value={proj.id}>
                  {proj.name || proj.code} {proj.code && `(${proj.code})`}
                </option>
              ))}
            </select>
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

