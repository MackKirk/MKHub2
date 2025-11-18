import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';

export default function Community() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [isUrgent, setIsUrgent] = useState(false);

  const createPostMutation = useMutation({
    mutationFn: (payload: { title: string; content: string; is_urgent: boolean }) =>
      api('POST', '/community/posts', payload),
    onSuccess: () => {
      toast.success('Announcement sent successfully!');
      queryClient.invalidateQueries({ queryKey: ['community-posts'] });
      // Reset form
      setTitle('');
      setContent('');
      setIsUrgent(false);
      // Navigate to home to see the new post
      navigate('/home');
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail || 'Failed to send announcement');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!title.trim()) {
      toast.error('Title is required');
      return;
    }
    
    if (!content.trim()) {
      toast.error('Content is required');
      return;
    }

    createPostMutation.mutate({
      title: title.trim(),
      content: content.trim(),
      is_urgent: isUrgent,
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">Community</h1>
          <p className="text-gray-600">Create announcements and share updates with your team.</p>
        </div>
      </div>

      <div className="rounded-xl border bg-white">
        <div className="p-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Title */}
            <div>
              <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-2">
                Title <span className="text-red-500">*</span>
              </label>
              <input
                id="title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Enter announcement title..."
                className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:ring-2 focus:ring-brand-red focus:border-transparent"
                required
              />
            </div>

            {/* Urgent Checkbox */}
            <div className="flex items-center gap-2">
              <input
                id="urgent"
                type="checkbox"
                checked={isUrgent}
                onChange={(e) => setIsUrgent(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-brand-red focus:ring-brand-red"
              />
              <label htmlFor="urgent" className="text-sm font-medium text-gray-700 cursor-pointer">
                Mark as urgent
              </label>
            </div>

            {/* Content */}
            <div>
              <label htmlFor="content" className="block text-sm font-medium text-gray-700 mb-2">
                Announcement Text <span className="text-red-500">*</span>
              </label>
              <textarea
                id="content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Write your announcement here..."
                rows={12}
                className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:ring-2 focus:ring-brand-red focus:border-transparent resize-y"
                required
              />
              <p className="text-xs text-gray-500 mt-1">
                This announcement will be visible to all employees in the Employee Community section on the Home page.
              </p>
            </div>

            {/* Submit Button */}
            <div className="flex justify-end gap-3 pt-4 border-t">
              <button
                type="button"
                onClick={() => navigate('/home')}
                className="px-4 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={createPostMutation.isLoading || !title.trim() || !content.trim()}
                className="px-6 py-2 rounded-lg bg-brand-red text-white hover:bg-red-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {createPostMutation.isLoading ? 'Sending...' : 'Send Announcement'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

