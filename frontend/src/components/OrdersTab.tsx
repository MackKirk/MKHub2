import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import { useConfirm } from '@/components/ConfirmProvider';

type Order = {
  id: string;
  project_id: string;
  estimate_id?: number;
  order_type: 'supplier' | 'shop_misc' | 'subcontractor';
  supplier_id?: string;
  supplier_name?: string;
  supplier_email?: string;
  recipient_email?: string;
  recipient_user_id?: string;
  recipient_name?: string;
  status: 'draft' | 'awaiting_delivery' | 'delivered';
  order_code?: string;
  email_subject?: string;
  email_body?: string;
  email_cc?: string;
  email_sent: boolean;
  email_sent_at?: string;
  delivered_at?: string;
  delivered_by?: string;
  notes?: string;
  created_at: string;
  items: OrderItem[];
};

type OrderItem = {
  id: string;
  order_id: string;
  estimate_item_id?: number;
  material_id?: number;
  item_type: string;
  name: string;
  description?: string;
  quantity: number;
  unit?: string;
  unit_price: number;
  total_price: number;
  section?: string;
  supplier_name?: string;
  is_ordered: boolean;
  created_at: string;
};

type Project = {
  id: string;
  name?: string;
  code?: string;
  site_address_line1?: string;
  site_city?: string;
  site_province?: string;
  site_country?: string;
  site_postal_code?: string;
};

export default function OrdersTab({ projectId, project }: { projectId: string; project: Project }) {
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [reviewingOrder, setReviewingOrder] = useState<Order | null>(null);
  const [viewingItemsOrder, setViewingItemsOrder] = useState<Order | null>(null);
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [emailTo, setEmailTo] = useState('');
  const [emailCc, setEmailCc] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string>('');

  const { data: orders = [], refetch } = useQuery<Order[]>({
    queryKey: ['projectOrders', projectId],
    queryFn: () => api<Order[]>('GET', `/orders/projects/${projectId}`),
    enabled: !!projectId
  });

  // Fetch employees/users for shop/misc orders
  const { data: employees = [] } = useQuery<any[]>({
    queryKey: ['employees'],
    queryFn: () => api<any[]>('GET', '/employees'),
    enabled: !!projectId
  });

  // Group orders by type
  const supplierOrders = orders.filter(o => o.order_type === 'supplier');
  const shopMiscOrders = orders.filter(o => o.order_type === 'shop_misc');
  const subcontractorOrders = orders.filter(o => o.order_type === 'subcontractor');

  const handleReviewEmail = (order: Order) => {
    setReviewingOrder(order);
    setSelectedUserId(order.recipient_user_id || '');
    
    // Set To email based on order type
    if (order.order_type === 'supplier') {
      // Supplier orders: use supplier email
      setEmailTo(order.supplier_email || '');
    } else if (order.order_type === 'subcontractor') {
      // Sub-contractor orders: use supplier email if available, otherwise empty for user to fill
      setEmailTo(order.supplier_email || order.recipient_email || '');
    } else {
      // Shop & Misc orders: use recipient email or leave empty for user to fill
      if (order.recipient_user_id) {
        const user = employees.find((e: any) => String(e.id) === String(order.recipient_user_id));
        setEmailTo(user?.email || order.recipient_email || '');
      } else {
        setEmailTo(order.recipient_email || '');
      }
    }
    
    setEmailCc(order.email_cc || '');
    setEmailSubject(order.email_subject || `Order ${order.order_code || order.id.slice(0, 8)} - ${project.name || 'Project'}`);
    
    // Generate email body if not already set
    if (!order.email_body) {
      const projectAddress = [
        project.site_address_line1,
        project.site_city,
        project.site_province,
        project.site_country,
        project.site_postal_code
      ].filter(Boolean).join(', ');
      
      let body = `Dear ${order.supplier_name || order.recipient_name || 'Team'},\n\n`;
      body += `We would like to place the following order for project: ${project.name || 'N/A'}\n`;
      if (projectAddress) {
        body += `Project Address: ${projectAddress}\n`;
      }
      body += `\nOrder Code: ${order.order_code || order.id.slice(0, 8)}\n\n`;
      body += `Items:\n`;
      body += `${'─'.repeat(80)}\n`;
      let totalOrder = 0;
      order.items.forEach((item, idx) => {
        body += `${idx + 1}. ${item.name}`;
        if (item.description) body += `\n   ${item.description}`;
        body += `\n   Quantity: ${item.quantity} ${item.unit || 'unit'}`;
        body += `\n   Unit Price: $${item.unit_price.toFixed(2)}`;
        body += `\n   Total: $${item.total_price.toFixed(2)}\n`;
        body += `${'─'.repeat(80)}\n`;
        totalOrder += item.total_price;
      });
      body += `\nOrder Total: $${totalOrder.toFixed(2)}\n\n`;
      body += `Please confirm receipt and expected delivery date.\n\nThank you,\n${project.name || 'Our Team'}`;
      setEmailBody(body);
    } else {
      setEmailBody(order.email_body);
    }
  };

  const handleSendEmail = async () => {
    if (!reviewingOrder) return;
    
    try {
      await api('PATCH', `/orders/${reviewingOrder.id}`, {
        status: 'awaiting_delivery',
        recipient_email: emailTo,
        recipient_user_id: selectedUserId || undefined,
        email_subject: emailSubject,
        email_body: emailBody,
        email_cc: emailCc || undefined
      });
      
      toast.success('Order sent and marked as Awaiting delivery');
      setReviewingOrder(null);
      await refetch();
      queryClient.invalidateQueries({ queryKey: ['projectOrders', projectId] });
    } catch (error: any) {
      const errorMsg = error.response?.data?.detail || error.message || 'Failed to send order';
      toast.error(errorMsg);
    }
  };

  const handleMarkDelivered = async (order: Order) => {
    const ok = await confirm({
      title: 'Mark as Delivered',
      message: `Mark order ${order.order_code || order.id.slice(0, 8)} as delivered?`,
      confirmText: 'Mark Delivered',
      cancelText: 'Cancel'
    });
    
    if (!ok) return;
    
    try {
      await api('PATCH', `/orders/${order.id}`, { status: 'delivered' });
      toast.success('Order marked as delivered');
      await refetch();
      queryClient.invalidateQueries({ queryKey: ['projectOrders', projectId] });
    } catch (error: any) {
      const errorMsg = error.response?.data?.detail || error.message || 'Failed to update order';
      toast.error(errorMsg);
    }
  };

  const getStatusBadge = (status: string) => {
    const badges: Record<string, { className: string; text: string }> = {
      draft: { className: 'bg-gray-100 text-gray-800', text: 'Draft' },
      awaiting_delivery: { className: 'bg-yellow-100 text-yellow-800', text: 'Ordered/Awaiting Delivery' },
      delivered: { className: 'bg-green-100 text-green-800', text: 'Delivered' }
    };
    const badge = badges[status] || badges.draft;
    return <span className={`px-2 py-1 rounded text-xs font-medium ${badge.className}`}>{badge.text}</span>;
  };

  const renderOrderCard = (order: Order) => {
    const totalAmount = order.items.reduce((sum, item) => sum + item.total_price, 0);
    return (
      <div key={order.id} className="border rounded-lg p-4 bg-white hover:shadow-md transition-shadow">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h4 className="font-semibold text-gray-900">
                {order.order_type === 'supplier' && order.supplier_name}
                {order.order_type === 'shop_misc' && 'Shop & Misc Order'}
                {order.order_type === 'subcontractor' && (order.supplier_name || 'Sub-contractor Order')}
              </h4>
              {getStatusBadge(order.status)}
            </div>
            {order.order_code && (
              <div className="text-xs text-gray-500 mb-1">Code: {order.order_code}</div>
            )}
            <button
              onClick={() => setViewingItemsOrder(order)}
              className="text-sm text-blue-600 hover:text-blue-800 hover:underline mb-1 cursor-pointer"
            >
              {order.items.length} item{order.items.length !== 1 ? 's' : ''} • Total: ${totalAmount.toFixed(2)}
            </button>
            {order.supplier_email && (
              <div className="text-xs text-gray-500 truncate">{order.supplier_email}</div>
            )}
            {order.recipient_email && !order.supplier_email && (
              <div className="text-xs text-gray-500 truncate">{order.recipient_email}</div>
            )}
          </div>
          <div className="flex flex-col gap-2 flex-shrink-0">
            <button
              onClick={() => handleReviewEmail(order)}
              disabled={order.status === 'delivered'}
              className="px-3 py-1.5 rounded bg-gray-400 text-white text-sm hover:bg-gray-500 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap transition-colors"
            >
              Review & Email
            </button>
            {order.status === 'awaiting_delivery' && (
              <button
                onClick={() => handleMarkDelivered(order)}
                className="px-3 py-1.5 rounded bg-green-600 text-white text-sm hover:bg-green-700 whitespace-nowrap"
              >
                Mark as Delivered
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  const handleClearAll = async () => {
    if (orders.length === 0) {
      toast.error('No orders to clear');
      return;
    }

    const result = await confirm({
      title: 'Clear All Orders',
      message: `Are you sure you want to delete all ${orders.length} order(s)? This action cannot be undone.`,
      confirmText: 'Delete All',
      cancelText: 'Cancel'
    });

    if (result !== 'confirm') return;

    try {
      await api('DELETE', `/orders/projects/${projectId}/all`);
      toast.success('All orders cleared');
      queryClient.invalidateQueries({ queryKey: ['projectOrders', projectId] });
      await refetch();
    } catch (error: any) {
      const errorMsg = error.response?.data?.detail || error.message || 'Failed to clear orders';
      toast.error(errorMsg);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header with Clear All button */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Orders</h2>
        {orders.length > 0 && (
          <button
            onClick={handleClearAll}
            className="px-4 py-2 rounded bg-red-600 text-white text-sm hover:bg-red-700 transition-colors"
          >
            Clear All
          </button>
        )}
      </div>

      {/* Supplier Orders Section */}
      <div className="rounded-xl border bg-white p-4">
        <h3 className="text-lg font-semibold mb-4">Supplier Orders</h3>
        {supplierOrders.length > 0 ? (
          <div className="grid md:grid-cols-2 gap-4">
            {supplierOrders.map(renderOrderCard)}
          </div>
        ) : (
          <div className="text-sm text-gray-500 py-4">No supplier orders yet</div>
        )}
      </div>

      {/* Shop & Misc Orders Section */}
      <div className="rounded-xl border bg-white p-4">
        <h3 className="text-lg font-semibold mb-4">Shop & Misc Orders</h3>
        {shopMiscOrders.length > 0 ? (
          <div className="grid md:grid-cols-2 gap-4">
            {shopMiscOrders.map(renderOrderCard)}
          </div>
        ) : (
          <div className="text-sm text-gray-500 py-4">No shop/misc orders yet</div>
        )}
      </div>

      {/* Sub-contractor Orders Section */}
      <div className="rounded-xl border bg-white p-4">
        <h3 className="text-lg font-semibold mb-4">Sub-contractor Orders</h3>
        {subcontractorOrders.length > 0 ? (
          <div className="grid md:grid-cols-2 gap-4">
            {subcontractorOrders.map(renderOrderCard)}
          </div>
        ) : (
          <div className="text-sm text-gray-500 py-4">No sub-contractor orders yet</div>
        )}
      </div>

      {/* Review & Email Modal */}
      {reviewingOrder && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="w-[800px] max-w-[95vw] bg-white rounded-xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="bg-gradient-to-br from-[#7f1010] to-[#a31414] p-6 flex items-center gap-6 relative flex-shrink-0">
              <div className="font-semibold text-lg text-white">Review & Email Order</div>
              <button
                onClick={() => setReviewingOrder(null)}
                className="ml-auto text-white hover:text-gray-200 text-2xl font-bold w-8 h-8 flex items-center justify-center rounded hover:bg-white/20"
                title="Close"
              >
                ×
              </button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto flex-1">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  To: {reviewingOrder.order_type === 'supplier' && <span className="text-xs text-gray-500">(auto-filled from supplier)</span>}
                      {reviewingOrder.order_type === 'shop_misc' && <span className="text-xs text-gray-500">(enter email or select user)</span>}
                      {reviewingOrder.order_type === 'subcontractor' && reviewingOrder.supplier_email ? <span className="text-xs text-gray-500">(auto-filled from supplier)</span> : <span className="text-xs text-gray-500">(enter email if no supplier)</span>}
                </label>
                <input
                  type="email"
                  className="w-full border rounded px-3 py-2"
                  value={emailTo}
                  onChange={(e) => setEmailTo(e.target.value)}
                  placeholder={reviewingOrder.order_type === 'shop_misc' ? 'Enter email or select user below' : 'recipient@example.com'}
                  required
                />
              </div>
              {reviewingOrder.order_type === 'shop_misc' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Or Select Internal User:</label>
                  <select
                    className="w-full border rounded px-3 py-2"
                    value={selectedUserId}
                    onChange={(e) => {
                      setSelectedUserId(e.target.value);
                      if (e.target.value) {
                        const user = employees.find((emp: any) => String(emp.id) === e.target.value);
                        if (user?.email) {
                          setEmailTo(user.email);
                        }
                      }
                    }}
                  >
                    <option value="">-- Select User --</option>
                    {employees.map((emp: any) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.name || emp.username} {emp.email ? `(${emp.email})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">CC (optional):</label>
                <input
                  type="email"
                  className="w-full border rounded px-3 py-2"
                  value={emailCc}
                  onChange={(e) => setEmailCc(e.target.value)}
                  placeholder="cc@example.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Subject:</label>
                <input
                  type="text"
                  className="w-full border rounded px-3 py-2"
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email Body (editable):</label>
                <textarea
                  rows={20}
                  className="w-full border rounded px-3 py-2 font-mono text-sm"
                  value={emailBody}
                  onChange={(e) => setEmailBody(e.target.value)}
                  placeholder="Email body will be generated automatically..."
                />
              </div>
              <div className="border-t pt-4 flex justify-end gap-2">
                <button
                  onClick={() => setReviewingOrder(null)}
                  className="px-4 py-2 rounded border bg-gray-100 hover:bg-gray-200"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSendEmail}
                  disabled={!emailTo || !emailSubject || !emailBody}
                  className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  Send Email
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Order Items Modal */}
      {viewingItemsOrder && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="w-[700px] max-w-[95vw] bg-white rounded-xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="bg-gradient-to-br from-[#7f1010] to-[#a31414] p-6 flex items-center gap-6 relative flex-shrink-0">
              <div className="font-semibold text-lg text-white">
                Order Items - {viewingItemsOrder.order_code || 'Order Details'}
              </div>
              <button
                onClick={() => setViewingItemsOrder(null)}
                className="ml-auto text-white hover:text-gray-200 text-2xl font-bold w-8 h-8 flex items-center justify-center rounded hover:bg-white/20"
                title="Close"
              >
                ×
              </button>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-gray-900">
                    {viewingItemsOrder.order_type === 'supplier' && viewingItemsOrder.supplier_name}
                    {viewingItemsOrder.order_type === 'shop_misc' && 'Shop & Misc Order'}
                    {viewingItemsOrder.order_type === 'subcontractor' && (viewingItemsOrder.supplier_name || 'Sub-contractor Order')}
                  </h3>
                  {getStatusBadge(viewingItemsOrder.status)}
                </div>
                {viewingItemsOrder.order_code && (
                  <div className="text-sm text-gray-600 mb-1">Code: {viewingItemsOrder.order_code}</div>
                )}
                <div className="text-sm text-gray-600">
                  Total: ${viewingItemsOrder.items.reduce((sum, item) => sum + item.total_price, 0).toFixed(2)}
                </div>
              </div>
              
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Item</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase">Quantity</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Unit</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase">Unit Price</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {viewingItemsOrder.items.map((item) => {
                      // Format quantity - remove .00 if integer
                      const quantity = item.quantity || 0;
                      const formattedQuantity = quantity % 1 === 0 ? quantity.toString() : quantity.toFixed(2);
                      
                      return (
                        <tr key={item.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm font-medium text-gray-900">{item.name}</td>
                          <td className="px-4 py-3 text-sm text-gray-900 text-right">{formattedQuantity}</td>
                          <td className="px-4 py-3 text-sm text-gray-600">{item.unit || '-'}</td>
                          <td className="px-4 py-3 text-sm text-gray-900 text-right">${item.unit_price.toFixed(2)}</td>
                          <td className="px-4 py-3 text-sm font-medium text-gray-900 text-right">${item.total_price.toFixed(2)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-gray-50 border-t">
                    <tr>
                      <td colSpan={4} className="px-4 py-3 text-sm font-semibold text-gray-900 text-right">
                        Grand Total:
                      </td>
                      <td className="px-4 py-3 text-sm font-semibold text-gray-900 text-right">
                        ${viewingItemsOrder.items.reduce((sum, item) => sum + item.total_price, 0).toFixed(2)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
            <div className="p-4 border-t bg-gray-50 flex justify-end">
              <button
                onClick={() => setViewingItemsOrder(null)}
                className="px-4 py-2 rounded bg-gray-200 hover:bg-gray-300 text-gray-800 text-sm"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

