import { useState } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import ImagePicker from '@/components/ImagePicker';

export default function Community() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [isUrgent, setIsUrgent] = useState(false);
  const [requiresReadConfirmation, setRequiresReadConfirmation] = useState(false);
  const [photoFileId, setPhotoFileId] = useState<string | null>(null);
  const [documentFileId, setDocumentFileId] = useState<string | null>(null);
  const [targetType, setTargetType] = useState<'all' | 'divisions'>('all');
  const [selectedDivisions, setSelectedDivisions] = useState<string[]>([]);
  const [imagePickerOpen, setImagePickerOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  
  // Get divisions from settings
  const { data: settings } = useQuery({
    queryKey: ['settings-bundle'],
    queryFn: () => api<any>('GET', '/settings'),
  });
  
  const divisions = (settings?.divisions || []) as Array<{ id: string; label: string; meta?: { abbr?: string; color?: string } }>;

  const createPostMutation = useMutation({
    mutationFn: (payload: { title: string; content: string; is_urgent: boolean; requires_read_confirmation: boolean; photo_file_id?: string; document_file_id?: string; target_type: string; target_division_ids?: string[] }) =>
      api('POST', '/community/posts', payload),
    onSuccess: () => {
      toast.success('Announcement sent successfully!');
      queryClient.invalidateQueries({ queryKey: ['community-posts'] });
      queryClient.invalidateQueries({ queryKey: ['my-community-posts'] });
      // Reset form
      setTitle('');
      setContent('');
      setIsUrgent(false);
      setRequiresReadConfirmation(false);
      setPhotoFileId(null);
      setDocumentFileId(null);
      setTargetType('all');
      setSelectedDivisions([]);
      // Navigate to home to see the new post
      navigate('/home');
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail || 'Failed to send announcement');
    },
  });

  // Fetch user's posts for history
  const { data: myPosts = [] } = useQuery({
    queryKey: ['my-community-posts'],
    queryFn: () => api<any[]>('GET', '/community/posts/my-posts'),
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

    if (targetType === 'divisions' && selectedDivisions.length === 0) {
      toast.error('Please select at least one division');
      return;
    }

    createPostMutation.mutate({
      title: title.trim(),
      content: content.trim(),
      is_urgent: isUrgent,
      requires_read_confirmation: requiresReadConfirmation,
      photo_file_id: photoFileId || undefined,
      document_file_id: documentFileId || undefined,
      target_type: targetType,
      target_division_ids: targetType === 'divisions' ? selectedDivisions : undefined,
    });
  };

  const handleImageConfirm = async (blob: Blob, originalFileObjectId?: string) => {
    // If we already have a file_object_id from the ImagePicker, use it
    if (originalFileObjectId) {
      setPhotoFileId(originalFileObjectId);
      setImagePickerOpen(false);
      toast.success('Image added successfully');
      return;
    }

    // Otherwise, upload the blob to get file_object_id using proxy endpoint (avoids CORS issues)
    try {
      // Create a file from blob
      const file = new File([blob], 'community-photo.jpg', { type: 'image/jpeg' });
      
      // Create FormData for proxy upload
      const formData = new FormData();
      formData.append('file', file);
      formData.append('original_name', file.name);
      formData.append('content_type', 'image/jpeg');
      formData.append('project_id', '');
      formData.append('client_id', '');
      formData.append('employee_id', '');
      formData.append('category_id', 'community-photo');
      
      // Upload via proxy endpoint (backend handles Azure upload to avoid CORS)
      const conf = await api('POST', '/files/upload-proxy', formData);
      
      if (!conf || !conf.id) {
        throw new Error('Invalid upload response');
      }
      
      setPhotoFileId(conf.id);
      setImagePickerOpen(false);
      toast.success('Image added successfully');
    } catch (error: any) {
      console.error('Failed to upload image:', error);
      const errorMessage = error?.response?.data?.detail || error?.message || 'Failed to upload image';
      toast.error(errorMessage);
      // Don't close the picker on error, let user try again
    }
  };

  const handleDocumentUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate PDF
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      toast.error('Please select a PDF file');
      return;
    }

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('original_name', file.name);
      formData.append('content_type', 'application/pdf');
      formData.append('project_id', '');
      formData.append('client_id', '');
      formData.append('employee_id', '');
      formData.append('category_id', 'community-document');

      const conf = await api('POST', '/files/upload-proxy', formData);

      if (!conf || !conf.id) {
        throw new Error('Invalid upload response');
      }

      setDocumentFileId(conf.id);
      toast.success('Document added successfully');
      
      // Reset file input
      e.target.value = '';
    } catch (error: any) {
      console.error('Failed to upload document:', error);
      const errorMessage = error?.response?.data?.detail || error?.message || 'Failed to upload document';
      toast.error(errorMessage);
    }
  };

  const handleRemovePhoto = () => {
    setPhotoFileId(null);
  };

  const handleRemoveDocument = () => {
    setDocumentFileId(null);
  };

  const toggleDivision = (divisionId: string) => {
    setSelectedDivisions((prev) =>
      prev.includes(divisionId)
        ? prev.filter((id) => id !== divisionId)
        : [...prev, divisionId]
    );
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

            {/* Attachment Upload */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Attachment (Optional)
              </label>
              <div className="space-y-3">
                {/* Image Preview */}
                {photoFileId && (
                  <div className="relative inline-block">
                    <img
                      src={`/files/${photoFileId}/thumbnail?w=400`}
                      alt="Preview"
                      className="max-w-full h-auto rounded-lg border border-gray-300 max-h-64 object-contain"
                    />
                    <button
                      type="button"
                      onClick={handleRemovePhoto}
                      className="absolute top-2 right-2 px-2 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700"
                    >
                      Remove
                    </button>
                  </div>
                )}
                
                {/* Document Preview */}
                {documentFileId && (
                  <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg border border-gray-300 max-w-md">
                    <svg className="w-8 h-8 text-red-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                    <span className="flex-1 text-sm text-gray-700">PDF Document</span>
                    <button
                      type="button"
                      onClick={handleRemoveDocument}
                      className="px-2 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700"
                    >
                      Remove
                    </button>
                  </div>
                )}

                {/* Buttons - side by side when no previews */}
                {!photoFileId && !documentFileId && (
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setImagePickerOpen(true)}
                      className="px-4 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 transition"
                    >
                      + Add Image
                    </button>
                    <label className="inline-block cursor-pointer">
                      <input
                        type="file"
                        accept=".pdf,application/pdf"
                        onChange={handleDocumentUpload}
                        className="hidden"
                      />
                      <span className="inline-block px-4 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 transition">
                        + Add Document
                      </span>
                    </label>
                  </div>
                )}

                {/* Individual buttons when one preview is shown */}
                {(!photoFileId || !documentFileId) && (photoFileId || documentFileId) && (
                  <div className="flex items-center gap-3">
                    {!photoFileId && (
                      <button
                        type="button"
                        onClick={() => setImagePickerOpen(true)}
                        className="px-4 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 transition"
                      >
                        + Add Image
                      </button>
                    )}
                    {!documentFileId && (
                      <label className="inline-block cursor-pointer">
                        <input
                          type="file"
                          accept=".pdf,application/pdf"
                          onChange={handleDocumentUpload}
                          className="hidden"
                        />
                        <span className="inline-block px-4 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 transition">
                          + Add Document
                        </span>
                      </label>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Target Audience */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Who should receive this announcement? <span className="text-red-500">*</span>
              </label>
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <input
                    id="target-all"
                    type="radio"
                    name="target"
                    checked={targetType === 'all'}
                    onChange={() => {
                      setTargetType('all');
                      setSelectedDivisions([]);
                    }}
                    className="w-4 h-4 border-gray-300 text-brand-red focus:ring-brand-red"
                  />
                  <label htmlFor="target-all" className="text-sm font-medium text-gray-700 cursor-pointer">
                    All employees (General announcement)
                  </label>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    id="target-divisions"
                    type="radio"
                    name="target"
                    checked={targetType === 'divisions'}
                    onChange={() => setTargetType('divisions')}
                    className="w-4 h-4 border-gray-300 text-brand-red focus:ring-brand-red"
                  />
                  <label htmlFor="target-divisions" className="text-sm font-medium text-gray-700 cursor-pointer">
                    Specific divisions only
                  </label>
                </div>
                
                {targetType === 'divisions' && (
                  <div className="ml-6 mt-2 border border-gray-200 rounded-lg p-4 bg-gray-50">
                    <label className="block text-xs font-medium text-gray-600 mb-2">
                      Select divisions:
                    </label>
                    {divisions.length === 0 ? (
                      <p className="text-xs text-gray-500">No divisions available. <a href="/settings" className="text-brand-red underline">Create divisions in System Settings</a></p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {divisions.map((div) => {
                          const isSelected = selectedDivisions.includes(div.id);
                          const bgColor = div.meta?.color || '#eef2f7';
                          return (
                            <button
                              key={div.id}
                              type="button"
                              onClick={() => toggleDivision(div.id)}
                              className={`px-3 py-1.5 rounded-full text-sm border transition flex items-center gap-2 ${
                                isSelected
                                  ? 'bg-white border-brand-red text-brand-red font-medium'
                                  : 'bg-white border-gray-300 text-gray-700 hover:border-gray-400'
                              }`}
                            >
                              <span
                                className="inline-block w-3 h-3 rounded-full"
                                style={{ backgroundColor: bgColor }}
                              />
                              <span>{div.meta?.abbr || div.label}</span>
                              {isSelected && <span className="text-brand-red">✓</span>}
                            </button>
                          );
                        })}
                      </div>
                    )}
                    {targetType === 'divisions' && selectedDivisions.length === 0 && (
                      <p className="text-xs text-red-600 mt-2">Please select at least one division</p>
                    )}
                  </div>
                )}
              </div>
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

            {/* Read Confirmation Checkbox */}
            <div className="flex items-center gap-2">
              <input
                id="read-confirmation"
                type="checkbox"
                checked={requiresReadConfirmation}
                onChange={(e) => setRequiresReadConfirmation(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-brand-red focus:ring-brand-red"
              />
              <label htmlFor="read-confirmation" className="text-sm font-medium text-gray-700 cursor-pointer">
                Request read confirmation
              </label>
              <span className="text-xs text-gray-500">(Recipients must confirm they read this message)</span>
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
                {targetType === 'all' 
                  ? 'This announcement will be visible to all employees in the Employee Community section on the Home page.'
                  : `This announcement will be visible only to employees in the selected divisions.`}
              </p>
            </div>

            {/* Image Picker Modal */}
            <ImagePicker
              isOpen={imagePickerOpen}
              onClose={() => setImagePickerOpen(false)}
              onConfirm={handleImageConfirm}
              clientId={undefined}
              targetWidth={1200}
              targetHeight={800}
              allowEdit={true}
            />

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
                disabled={
                  createPostMutation.isLoading || 
                  !title.trim() || 
                  !content.trim() ||
                  (targetType === 'divisions' && selectedDivisions.length === 0)
                }
                className="px-6 py-2 rounded-lg bg-brand-red text-white hover:bg-red-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {createPostMutation.isLoading ? 'Sending...' : 'Send Announcement'}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* History Section */}
      <div className="rounded-xl border bg-white">
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-bold">My Announcements</h2>
              <p className="text-sm text-gray-600">View all announcements you've created</p>
            </div>
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="px-4 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 transition"
            >
              {showHistory ? 'Hide' : 'Show'} History
            </button>
          </div>

          {showHistory && (
            <div className="space-y-4 mt-4">
              {myPosts.length === 0 ? (
                <div className="text-center text-gray-500 py-8">
                  No announcements created yet
                </div>
              ) : (
                myPosts.map((post: any) => (
                  <PostHistoryItem key={post.id} post={post} />
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PostHistoryItem({ post }: { post: any }) {
  const [showConfirmations, setShowConfirmations] = useState(false);
  const { data: confirmations = [] } = useQuery({
    queryKey: ['post-read-confirmations', post.id],
    queryFn: () => api<any[]>('GET', `/community/posts/${post.id}/read-confirmations`),
    enabled: post.requires_read_confirmation && showConfirmations,
  });

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffHours < 1) return 'Just now';
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="border rounded-lg p-4">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <h3 className="font-semibold text-gray-900">{post.title}</h3>
            {post.requires_read_confirmation && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-yellow-100 text-yellow-800 border border-yellow-300">
                <span>✓</span>
                <span>Read confirmation required</span>
              </span>
            )}
            {post.is_urgent && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-red-100 text-red-800 border border-red-300">
                Urgent
              </span>
            )}
          </div>
          <p className="text-sm text-gray-600 mb-2 line-clamp-2">{post.content}</p>
          <div className="text-xs text-gray-500">
            Created {formatTimeAgo(post.created_at)} · {post.requires_read_confirmation 
              ? `${post.confirmations_count || 0}${post.total_recipients ? `/${post.total_recipients}` : ''} confirmations`
              : `${post.confirmations_count || 0} total views`
            }
          </div>
        </div>
      </div>

      {post.requires_read_confirmation && (
        <div className="mt-4 pt-4 border-t">
          <button
            onClick={() => setShowConfirmations(!showConfirmations)}
            className="text-sm text-blue-600 hover:text-blue-700 font-medium"
          >
            {showConfirmations ? 'Hide' : 'Show'} who confirmed reading ({post.confirmations_count || 0})
          </button>

          {showConfirmations && confirmations.length > 0 && (
            <div className="mt-3 space-y-2">
              {confirmations.map((conf: any) => (
                <div key={conf.user_id} className="flex items-center gap-2 text-sm">
                  <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
                    {conf.user_avatar ? (
                      <img
                        src={conf.user_avatar}
                        alt={conf.user_name || 'User'}
                        className="w-full h-full rounded-full object-cover"
                      />
                    ) : (
                      <span className="text-gray-500 text-xs">
                        {(conf.user_name || 'U')[0].toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="font-medium text-gray-900">{conf.user_name || 'Unknown'}</div>
                    <div className="text-xs text-gray-500">
                      Confirmed {formatTimeAgo(conf.confirmed_at)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {showConfirmations && confirmations.length === 0 && (
            <div className="mt-3 text-sm text-gray-500">
              No confirmations yet
            </div>
          )}
        </div>
      )}
    </div>
  );
}

