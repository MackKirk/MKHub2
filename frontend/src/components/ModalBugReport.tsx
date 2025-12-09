import { useState } from 'react';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';

interface ModalBugReportProps {
  onClose: () => void;
  onSuccess: () => void;
}

export default function ModalBugReport({ onClose, onSuccess }: ModalBugReportProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState<'Low' | 'Medium' | 'High'>('Medium');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!title.trim()) {
      toast.error('Title is required');
      return;
    }
    
    if (!description.trim()) {
      toast.error('Description is required');
      return;
    }

    setSubmitting(true);
    
    try {
      // Capture browser/environment data
      const pageUrl = window.location.href;
      const userAgent = navigator.userAgent;
      const screen = {
        width: window.screen.width,
        height: window.screen.height,
      };

      await api('POST', '/bug-report', {
        title: title.trim(),
        description: description.trim(),
        severity,
        page_url: pageUrl,
        user_agent: userAgent,
        screen,
      });

      toast.success('Bug report submitted successfully!');
      setTitle('');
      setDescription('');
      setSeverity('Medium');
      onSuccess();
    } catch (error: any) {
      toast.error(error?.message || 'Failed to submit bug report');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div 
        className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-br from-[#7f1010] to-[#a31414] p-6 flex items-center justify-between flex-shrink-0">
          <h2 className="text-xl font-semibold text-white">Report a Bug</h2>
          <button
            onClick={onClose}
            className="text-2xl font-bold text-white hover:text-gray-200 w-8 h-8 flex items-center justify-center rounded hover:bg-white/20 transition-colors"
            disabled={submitting}
          >
            ×
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-brand-red focus:border-transparent"
              placeholder="Brief description of the issue"
              disabled={submitting}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description <span className="text-red-500">*</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={6}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-brand-red focus:border-transparent resize-none"
              placeholder="Please provide detailed information about the bug, including steps to reproduce if possible..."
              disabled={submitting}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Severity <span className="text-red-500">*</span>
            </label>
            <select
              value={severity}
              onChange={(e) => setSeverity(e.target.value as 'Low' | 'Medium' | 'High')}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-brand-red focus:border-transparent"
              disabled={submitting}
            >
              <option value="Low">Low - Minor issue, doesn't affect core functionality</option>
              <option value="Medium">Medium - Affects functionality but has workaround</option>
              <option value="High">High - Critical issue, blocks core functionality</option>
            </select>
          </div>

          <div className="text-xs text-gray-500 pt-2 border-t">
            <p className="mb-1">The following information will be automatically captured:</p>
            <ul className="list-disc list-inside space-y-0.5">
              <li>Current page URL</li>
              <li>Browser and device information</li>
              <li>Screen resolution</li>
              <li>Your user account</li>
            </ul>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-brand-red text-white rounded-lg hover:bg-[#a31414] transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              disabled={submitting}
            >
              {submitting ? 'Submitting...' : 'Submit Report'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

