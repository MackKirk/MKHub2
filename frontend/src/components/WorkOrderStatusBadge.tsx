type Props = {
  status: string;
  urgency?: string;
};

export default function WorkOrderStatusBadge({ status, urgency }: Props) {
  const statusColors: Record<string, string> = {
    open: 'bg-blue-100 text-blue-800',
    in_progress: 'bg-yellow-100 text-yellow-800',
    pending_parts: 'bg-orange-100 text-orange-800',
    closed: 'bg-green-100 text-green-800',
    cancelled: 'bg-red-100 text-red-800',
  };

  const urgencyColors: Record<string, string> = {
    low: 'bg-blue-100 text-blue-800',
    normal: 'bg-gray-100 text-gray-800',
    high: 'bg-orange-100 text-orange-800',
    urgent: 'bg-red-100 text-red-800',
  };

  return (
    <div className="flex gap-2">
      <span className={`px-2 py-1 rounded text-xs font-medium ${statusColors[status] || 'bg-gray-100 text-gray-800'}`}>
        {status.replace('_', ' ')}
      </span>
      {urgency && (
        <span className={`px-2 py-1 rounded text-xs font-medium ${urgencyColors[urgency] || 'bg-gray-100 text-gray-800'}`}>
          {urgency}
        </span>
      )}
    </div>
  );
}

