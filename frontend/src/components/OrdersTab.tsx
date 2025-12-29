import { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
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

export default function OrdersTab({ projectId, project, statusLabel }: { projectId: string; project: Project; statusLabel?: string }) {
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const location = useLocation();
  const nav = useNavigate();
  const [reviewingOrder, setReviewingOrder] = useState<Order | null>(null);
  
  // Check permissions for orders
  const { data: me } = useQuery({ queryKey:['me'], queryFn: ()=>api<any>('GET','/auth/me') });
  const isAdmin = (me?.roles||[]).includes('admin');
  const permissions = new Set(me?.permissions || []);
  const hasEditPermission = isAdmin || permissions.has('business:projects:orders:write');
  
  // Check if editing is restricted based on status (only Finished restricts editing)
  const isEditingRestricted = useMemo(() => {
    if (!statusLabel) return false;
    const statusLower = String(statusLabel).trim().toLowerCase();
    return statusLower === 'finished';
  }, [statusLabel]);
  
  const canEditOrders = hasEditPermission && !isEditingRestricted;
  
  const handleBackToOverview = () => {
    nav(location.pathname, { replace: true });
  };
  const [viewingItemsOrder, setViewingItemsOrder] = useState<Order | null>(null);
  const [showAddExtraOrder, setShowAddExtraOrder] = useState(false);
  const [addOrderStep, setAddOrderStep] = useState<1 | 2>(1);
  const [addOrderType, setAddOrderType] = useState<'supplier' | 'shop_misc' | 'subcontractor' | null>(null);
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
          {canEditOrders && (
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
          )}
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
      {/* Editing Restricted Warning */}
      {isEditingRestricted && statusLabel && (
        <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-800">
          <strong>Editing Restricted:</strong> This project has status "{statusLabel}" which does not allow editing orders.
        </div>
      )}
      
      {/* Header with Clear All button */}
      {/* Minimalist header */}
      <div className="mb-4">
        <div className="flex items-center gap-3">
          <button
            onClick={handleBackToOverview}
            className="p-2 rounded-lg border hover:bg-gray-50 transition-colors flex items-center justify-center"
            title="Back to Overview"
          >
            <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </button>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Orders</h3>
            <p className="text-xs text-gray-500">Purchase orders and supplies</p>
          </div>
        </div>
      </div>
      
      {canEditOrders && (
        <div className="flex items-center justify-between">
          <div className="flex gap-2">
            <button
              onClick={() => {
                setShowAddExtraOrder(true);
                setAddOrderStep(1);
                setAddOrderType(null);
              }}
              className="px-4 py-2 rounded bg-brand-red text-white text-sm hover:bg-red-700 transition-colors"
            >
              + Add Extra Order
            </button>
            {orders.length > 0 && (
              <button
                onClick={handleClearAll}
                className="px-4 py-2 rounded bg-red-600 text-white text-sm hover:bg-red-700 transition-colors"
              >
                Clear All
              </button>
            )}
          </div>
        </div>
      )}

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

      {/* Add Extra Order Wizard Modal */}
      {showAddExtraOrder && <AddExtraOrderWizard 
        projectId={projectId}
        step={addOrderStep}
        orderType={addOrderType}
        onStepChange={setAddOrderStep}
        onOrderTypeSelect={setAddOrderType}
        onClose={() => {
          setShowAddExtraOrder(false);
          setAddOrderStep(1);
          setAddOrderType(null);
        }}
        onSuccess={() => {
          setShowAddExtraOrder(false);
          setAddOrderStep(1);
          setAddOrderType(null);
          refetch();
        }}
      />}
    </div>
  );
}

// Add Extra Order Wizard Component
function AddExtraOrderWizard({ 
  projectId, 
  step, 
  orderType, 
  onStepChange, 
  onOrderTypeSelect, 
  onClose, 
  onSuccess 
}: { 
  projectId: string; 
  step: 1 | 2; 
  orderType: 'supplier' | 'shop_misc' | 'subcontractor' | null; 
  onStepChange: (s: 1 | 2) => void; 
  onOrderTypeSelect: (t: 'supplier' | 'shop_misc' | 'subcontractor' | null) => void; 
  onClose: () => void; 
  onSuccess: () => void;
}) {
  const queryClient = useQueryClient();
  
  // Supplier Order state
  const [supplierId, setSupplierId] = useState<string>('');
  const [customSupplierName, setCustomSupplierName] = useState('');
  const [customSupplierEmail, setCustomSupplierEmail] = useState('');
  const [useCustomSupplier, setUseCustomSupplier] = useState(false);
  const [productSearchModalOpen, setProductSearchModalOpen] = useState<{itemId: string} | null>(null);
  
  // Shop & Misc Order state
  const [recipientEmail, setRecipientEmail] = useState('');
  const [recipientUserId, setRecipientUserId] = useState<string>('');
  
  // Sub-contractor Order state (now uses same fields as Shop & Misc)
  
  // Items state (shared)
  const [orderItems, setOrderItems] = useState<Array<{
    id: string;
    material_id?: number;
    name: string;
    description?: string;
    quantity: number;
    unit?: string;
    unit_price: number;
    total_price: number;
    notes?: string;
  }>>([{ id: '1', name: '', quantity: 1, unit_price: 0, total_price: 0 }]);
  
  // Fetch suppliers, products, employees
  const { data: suppliers = [] } = useQuery<any[]>({
    queryKey: ['suppliers'],
    queryFn: () => api<any[]>('GET', '/inventory/suppliers'),
    enabled: (orderType === 'supplier' || orderType === 'subcontractor')
  });
  
  // Get selected supplier name for filtering
  const selectedSupplierName = useMemo(() => {
    if (!supplierId || useCustomSupplier) return null;
    const supplier = suppliers.find((s: any) => s.id === supplierId);
    return supplier?.name || null;
  }, [supplierId, suppliers, useCustomSupplier]);
  
  // Track which item is being edited for autocomplete
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [dropdownPosition, setDropdownPosition] = useState<{ top: number; left: number; width: number } | null>(null);
  
  const currentItem = useMemo(() => {
    if (!editingItemId) return null;
    return orderItems.find(item => item.id === editingItemId);
  }, [editingItemId, orderItems]);
  
  const { data: products = [] } = useQuery<any[]>({
    queryKey: ['products-search', currentItem?.name, selectedSupplierName],
    queryFn: async () => {
      if (!currentItem?.name) return [];
      const params = new URLSearchParams();
      params.set('q', currentItem.name);
      if (selectedSupplierName) {
        params.set('supplier', selectedSupplierName);
      }
      return await api<any[]>('GET', `/estimate/products/search?${params.toString()}`);
    },
    enabled: orderType === 'supplier' && !!currentItem?.name && !!editingItemId
  });
  
  const { data: employees = [] } = useQuery<any[]>({
    queryKey: ['employees'],
    queryFn: () => api<any[]>('GET', '/employees'),
    enabled: orderType === 'shop_misc' || orderType === 'subcontractor'
  });
  
  // Reset form when step or order type changes
  useEffect(() => {
    if (step === 1) {
      // Reset all form fields when going back to step 1
      setSupplierId('');
      setCustomSupplierName('');
      setCustomSupplierEmail('');
      setUseCustomSupplier(false);
      setRecipientEmail('');
      setRecipientUserId('');
      setOrderItems([{ id: '1', name: '', quantity: 1, unit_price: 0, total_price: 0 }]);
    }
  }, [step]);
  
  const handleAddItem = () => {
    setOrderItems([...orderItems, { 
      id: Date.now().toString(), 
      name: '', 
      quantity: 1, 
      unit_price: 0, 
      total_price: 0 
    }]);
  };
  
  const handleRemoveItem = (id: string) => {
    if (orderItems.length > 1) {
      setOrderItems(orderItems.filter(item => item.id !== id));
    }
  };
  
  const handleItemChange = (id: string, field: string, value: any) => {
    setOrderItems(orderItems.map(item => {
      if (item.id === id) {
        const updated = { ...item, [field]: value };
        if (field === 'quantity' || field === 'unit_price') {
          updated.total_price = (updated.quantity || 0) * (updated.unit_price || 0);
        }
        // Name field doesn't need special handling for autocomplete
        return updated;
      }
      return item;
    }));
  };
  
  const handleProductSelect = (itemId: string, product: any) => {
    // If no supplier is selected and product has a supplier, auto-select the supplier
    if (!supplierId && !useCustomSupplier && product.supplier_name) {
      // Find supplier by name
      const matchingSupplier = suppliers.find((s: any) => s.name === product.supplier_name);
      if (matchingSupplier) {
        setSupplierId(matchingSupplier.id);
      }
    }
    
    setOrderItems(orderItems.map(item => {
      if (item.id === itemId) {
        return {
          ...item,
          material_id: product.id,
          name: product.name,
          unit: product.unit || '',
          unit_price: product.price || 0,
          total_price: (item.quantity || 0) * (product.price || 0)
        };
      }
      return item;
    }));
    setProductSearchModalOpen(null);
  };
  
  // Filter products by supplier for autocomplete (already filtered by API if supplier selected)
  const filteredProducts = useMemo(() => {
    return products || [];
  }, [products]);
  
  const handleSaveAsDraft = async () => {
    try {
      // Validate
      if (!orderType) {
        toast.error('Please select an order type');
        return;
      }
      
      if (orderItems.some(item => !item.name || item.quantity <= 0 || item.unit_price <= 0)) {
        toast.error('Please fill all required fields for items');
        return;
      }
      
      if (orderType === 'supplier') {
        if (!useCustomSupplier && !supplierId) {
          toast.error('Please select a supplier');
          return;
        }
        if (useCustomSupplier && !customSupplierName) {
          toast.error('Please enter supplier name');
          return;
        }
      }
      
      if (orderType === 'shop_misc') {
        if (!recipientEmail && !recipientUserId) {
          toast.error('Please enter recipient email or select internal user');
          return;
        }
      }
      
      if (orderType === 'subcontractor') {
        if (!recipientEmail && !recipientUserId) {
          toast.error('Please enter recipient email or select internal user');
          return;
        }
      }
      
      // Prepare payload
      const payload: any = {
        project_id: projectId,
        order_type: orderType,
        items: orderItems.map(item => ({
          item_type: orderType === 'supplier' ? 'product' : orderType === 'shop_misc' ? 'miscellaneous' : 'subcontractor',
          name: item.name,
          description: item.description || item.notes || undefined,
          quantity: item.quantity,
          unit: item.unit || undefined,
          unit_price: item.unit_price,
          total_price: item.total_price,
          material_id: item.material_id || undefined
        }))
      };
      
      if (orderType === 'supplier') {
        if (useCustomSupplier) {
          payload.supplier_name = customSupplierName;
          payload.supplier_email = customSupplierEmail;
        } else {
          payload.supplier_id = supplierId;
        }
      }
      
      if (orderType === 'shop_misc') {
        payload.recipient_email = recipientEmail;
        if (recipientUserId) {
          payload.recipient_user_id = recipientUserId;
        }
      }
      
      if (orderType === 'subcontractor') {
        payload.recipient_email = recipientEmail;
        if (recipientUserId) {
          payload.recipient_user_id = recipientUserId;
        }
      }
      
      await api('POST', `/orders/projects/${projectId}/extra`, payload);
      toast.success('Order created successfully');
      queryClient.invalidateQueries({ queryKey: ['projectOrders', projectId] });
      onSuccess();
    } catch (error: any) {
      const errorMsg = error.response?.data?.detail || error.message || 'Failed to create order';
      toast.error(errorMsg);
    }
  };
  
  return (
    <div className="fixed inset-0 z-[70] bg-black/60 flex items-center justify-center p-4">
      <div className="w-[900px] max-w-[95vw] bg-white rounded-xl overflow-hidden max-h-[90vh] flex flex-col" style={{ position: 'relative', zIndex: 70 }}>
        <div className="bg-gradient-to-br from-[#7f1010] to-[#a31414] p-6 flex items-center gap-6 relative flex-shrink-0">
          <div className="font-semibold text-lg text-white">Add Extra Order</div>
          <button
            onClick={onClose}
            className="ml-auto text-white hover:text-gray-200 text-2xl font-bold w-8 h-8 flex items-center justify-center rounded hover:bg-white/20"
            title="Close"
          >
            ×
          </button>
        </div>
        
        <div className="p-6 overflow-y-auto flex-1">
          {step === 1 ? (
            // Step 1: Select Order Type
            <div className="space-y-4">
              <div className="text-sm text-gray-600 mb-4">Select the type of order you want to create:</div>
              <div className="grid grid-cols-3 gap-4">
                <button
                  onClick={() => {
                    onOrderTypeSelect('supplier');
                    onStepChange(2);
                  }}
                  className="p-6 border-2 border-gray-200 rounded-lg hover:border-brand-red hover:bg-red-50 transition-all text-left"
                >
                  <div className="font-semibold text-gray-900 mb-2">Supplier Order</div>
                  <div className="text-sm text-gray-600">Order from external suppliers for products</div>
                </button>
                
                <button
                  onClick={() => {
                    onOrderTypeSelect('shop_misc');
                    onStepChange(2);
                  }}
                  className="p-6 border-2 border-gray-200 rounded-lg hover:border-brand-red hover:bg-red-50 transition-all text-left"
                >
                  <div className="font-semibold text-gray-900 mb-2">Shop & Misc Order</div>
                  <div className="text-sm text-gray-600">Internal orders or items without supplier</div>
                </button>
                
                <button
                  onClick={() => {
                    onOrderTypeSelect('subcontractor');
                    onStepChange(2);
                  }}
                  className="p-6 border-2 border-gray-200 rounded-lg hover:border-brand-red hover:bg-red-50 transition-all text-left"
                >
                  <div className="font-semibold text-gray-900 mb-2">Sub-contractor Order</div>
                  <div className="text-sm text-gray-600">Service orders for rentals and equipment</div>
                </button>
              </div>
            </div>
          ) : (
            // Step 2: Order Details Form
            <div className="space-y-6">
              {/* Supplier Order Form */}
              {orderType === 'supplier' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Supplier</label>
                    <div className="flex items-center gap-2 mb-2">
                      <input
                        type="checkbox"
                        checked={useCustomSupplier}
                        onChange={(e) => setUseCustomSupplier(e.target.checked)}
                        className="rounded"
                      />
                      <label className="text-sm text-gray-600">Use custom supplier</label>
                    </div>
                    {useCustomSupplier ? (
                      <div className="space-y-2">
                        <input
                          type="text"
                          placeholder="Supplier name"
                          value={customSupplierName}
                          onChange={(e) => setCustomSupplierName(e.target.value)}
                          className="w-full border rounded px-3 py-2"
                          required
                        />
                        <input
                          type="email"
                          placeholder="Supplier email"
                          value={customSupplierEmail}
                          onChange={(e) => setCustomSupplierEmail(e.target.value)}
                          className="w-full border rounded px-3 py-2"
                        />
                      </div>
                    ) : (
                      <select
                        value={supplierId}
                        onChange={(e) => setSupplierId(e.target.value)}
                        className="w-full border rounded px-3 py-2"
                        required
                      >
                        <option value="">-- Select Supplier --</option>
                        {suppliers.map((supplier: any) => (
                          <option key={supplier.id} value={supplier.id}>
                            {supplier.name} {supplier.email ? `(${supplier.email})` : ''}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                  
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-sm font-medium text-gray-700">Items</label>
                      <button
                        type="button"
                        onClick={handleAddItem}
                        className="px-3 py-1 text-sm rounded bg-gray-100 hover:bg-gray-200"
                      >
                        + Add Item
                      </button>
                    </div>
                    <div className={`border rounded-lg ${editingItemId ? 'overflow-visible' : 'overflow-hidden'}`}>
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-b">
                          <tr>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-700">Product</th>
                            <th className="px-3 py-2 text-right text-xs font-medium text-gray-700">Qty</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-700">Unit</th>
                            <th className="px-3 py-2 text-right text-xs font-medium text-gray-700">Unit Price</th>
                            <th className="px-3 py-2 text-right text-xs font-medium text-gray-700">Total</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-700">Notes</th>
                            <th className="px-3 py-2"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {orderItems.map((item) => (
                            <tr key={item.id}>
                              <td className="px-3 py-2" style={{ position: 'relative', zIndex: editingItemId === item.id ? 9999 : 'auto' }}>
                                <div className="flex items-center gap-2">
                                  <div className="flex-1 relative">
                                    <input
                                      type="text"
                                      placeholder="Enter product name"
                                      value={item.name}
                                      ref={(el) => {
                                        inputRefs.current[item.id] = el;
                                      }}
                                      onChange={(e) => {
                                        handleItemChange(item.id, 'name', e.target.value);
                                        setEditingItemId(item.id);
                                        // Update position when typing
                                        setTimeout(() => {
                                          if (inputRefs.current[item.id]) {
                                            const rect = inputRefs.current[item.id]!.getBoundingClientRect();
                                            setDropdownPosition({
                                              top: rect.bottom,
                                              left: rect.left,
                                              width: rect.width
                                            });
                                          }
                                        }, 0);
                                      }}
                                      onFocus={(e) => {
                                        setEditingItemId(item.id);
                                        const rect = e.currentTarget.getBoundingClientRect();
                                        setDropdownPosition({
                                          top: rect.bottom, // Fixed is relative to viewport
                                          left: rect.left, // Fixed is relative to viewport
                                          width: rect.width
                                        });
                                      }}
                                      onBlur={() => {
                                        // Delay to allow click on autocomplete item
                                        setTimeout(() => {
                                          setEditingItemId(null);
                                          setDropdownPosition(null);
                                        }, 200);
                                      }}
                                      className="w-full border rounded px-2 py-1 text-sm"
                                      required
                                    />
                                    {editingItemId === item.id && filteredProducts.length > 0 && item.name && !item.material_id && dropdownPosition && (
                                      <div 
                                        className="fixed z-[10000] bg-white border-2 border-gray-300 rounded-lg shadow-2xl max-h-40 overflow-auto" 
                                        style={{ 
                                          position: 'fixed', 
                                          zIndex: 10000, 
                                          top: `${dropdownPosition.top}px`,
                                          left: `${dropdownPosition.left}px`,
                                          width: `${dropdownPosition.width}px`
                                        }}
                                      >
                                        {filteredProducts.slice(0, 5).map((product: any) => (
                                          <button
                                            key={product.id}
                                            type="button"
                                            onClick={(e) => {
                                              e.preventDefault();
                                              handleProductSelect(item.id, product);
                                              setEditingItemId(null);
                                            }}
                                            className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm border-b last:border-b-0"
                                          >
                                            <div className="font-medium">{product.name}</div>
                                            <div className="text-xs text-gray-500">
                                              {product.supplier_name || ''} · {product.unit || ''} · ${Number(product.price || 0).toFixed(2)}
                                            </div>
                                          </button>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => setProductSearchModalOpen({ itemId: item.id })}
                                    className="px-2 py-1 rounded text-gray-500 hover:text-blue-600"
                                    title="Browse products"
                                  >
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                      <circle cx="11" cy="11" r="8"></circle>
                                      <path d="M21 21l-4.35-4.35"></path>
                                    </svg>
                                  </button>
                                </div>
                              </td>
                              <td className="px-3 py-2">
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  value={item.quantity}
                                  onChange={(e) => handleItemChange(item.id, 'quantity', parseFloat(e.target.value) || 0)}
                                  className="w-20 border rounded px-2 py-1 text-sm text-right"
                                  required
                                />
                              </td>
                              <td className="px-3 py-2">
                                <input
                                  type="text"
                                  placeholder="Unit"
                                  value={item.unit || ''}
                                  onChange={(e) => handleItemChange(item.id, 'unit', e.target.value)}
                                  className="w-20 border rounded px-2 py-1 text-sm"
                                />
                              </td>
                              <td className="px-3 py-2">
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  value={item.unit_price}
                                  onChange={(e) => handleItemChange(item.id, 'unit_price', parseFloat(e.target.value) || 0)}
                                  className="w-24 border rounded px-2 py-1 text-sm text-right"
                                  required
                                />
                              </td>
                              <td className="px-3 py-2 text-right text-sm font-medium">
                                ${item.total_price.toFixed(2)}
                              </td>
                              <td className="px-3 py-2">
                                <input
                                  type="text"
                                  placeholder="Optional"
                                  value={item.notes || ''}
                                  onChange={(e) => handleItemChange(item.id, 'notes', e.target.value)}
                                  className="w-full border rounded px-2 py-1 text-sm"
                                />
                              </td>
                              <td className="px-3 py-2">
                                {orderItems.length > 1 && (
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveItem(item.id)}
                                    className="text-red-600 hover:text-red-800 text-sm"
                                  >
                                    ×
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
              
              {/* Shop & Misc Order Form */}
              {orderType === 'shop_misc' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Recipient Email</label>
                    <input
                      type="email"
                      placeholder="recipient@example.com"
                      value={recipientEmail}
                      onChange={(e) => setRecipientEmail(e.target.value)}
                      className="w-full border rounded px-3 py-2"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Or Select Internal User</label>
                    <select
                      value={recipientUserId}
                      onChange={(e) => {
                        setRecipientUserId(e.target.value);
                        if (e.target.value) {
                          const user = employees.find((emp: any) => String(emp.id) === e.target.value);
                          if (user?.email) {
                            setRecipientEmail(user.email);
                          }
                        }
                      }}
                      className="w-full border rounded px-3 py-2"
                    >
                      <option value="">-- Select User --</option>
                      {employees.map((emp: any) => (
                        <option key={emp.id} value={emp.id}>
                          {emp.name || emp.username} {emp.email ? `(${emp.email})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-sm font-medium text-gray-700">Items</label>
                      <button
                        type="button"
                        onClick={handleAddItem}
                        className="px-3 py-1 text-sm rounded bg-gray-100 hover:bg-gray-200"
                      >
                        + Add Item
                      </button>
                    </div>
                    <div className="border rounded-lg overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-b">
                          <tr>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-700">Description</th>
                            <th className="px-3 py-2 text-right text-xs font-medium text-gray-700">Qty</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-700">Unit</th>
                            <th className="px-3 py-2 text-right text-xs font-medium text-gray-700">Unit Price</th>
                            <th className="px-3 py-2 text-right text-xs font-medium text-gray-700">Total</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-700">Notes</th>
                            <th className="px-3 py-2"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {orderItems.map((item) => (
                            <tr key={item.id}>
                              <td className="px-3 py-2">
                                <input
                                  type="text"
                                  placeholder="Item description"
                                  value={item.name}
                                  onChange={(e) => handleItemChange(item.id, 'name', e.target.value)}
                                  className="w-full border rounded px-2 py-1 text-sm"
                                  required
                                />
                              </td>
                              <td className="px-3 py-2">
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  value={item.quantity}
                                  onChange={(e) => handleItemChange(item.id, 'quantity', parseFloat(e.target.value) || 0)}
                                  className="w-20 border rounded px-2 py-1 text-sm text-right"
                                  required
                                />
                              </td>
                              <td className="px-3 py-2">
                                <input
                                  type="text"
                                  placeholder="Unit"
                                  value={item.unit || ''}
                                  onChange={(e) => handleItemChange(item.id, 'unit', e.target.value)}
                                  className="w-20 border rounded px-2 py-1 text-sm"
                                />
                              </td>
                              <td className="px-3 py-2">
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  value={item.unit_price}
                                  onChange={(e) => handleItemChange(item.id, 'unit_price', parseFloat(e.target.value) || 0)}
                                  className="w-24 border rounded px-2 py-1 text-sm text-right"
                                  required
                                />
                              </td>
                              <td className="px-3 py-2 text-right text-sm font-medium">
                                ${item.total_price.toFixed(2)}
                              </td>
                              <td className="px-3 py-2">
                                <input
                                  type="text"
                                  placeholder="Optional"
                                  value={item.notes || ''}
                                  onChange={(e) => handleItemChange(item.id, 'notes', e.target.value)}
                                  className="w-full border rounded px-2 py-1 text-sm"
                                />
                              </td>
                              <td className="px-3 py-2">
                                {orderItems.length > 1 && (
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveItem(item.id)}
                                    className="text-red-600 hover:text-red-800 text-sm"
                                  >
                                    ×
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
              
              {/* Sub-contractor Order Form */}
              {orderType === 'subcontractor' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Recipient Email</label>
                    <input
                      type="email"
                      placeholder="recipient@example.com"
                      value={recipientEmail}
                      onChange={(e) => setRecipientEmail(e.target.value)}
                      className="w-full border rounded px-3 py-2"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Or Select Internal User</label>
                    <select
                      value={recipientUserId}
                      onChange={(e) => {
                        setRecipientUserId(e.target.value);
                        if (e.target.value) {
                          const user = employees.find((emp: any) => String(emp.id) === e.target.value);
                          if (user?.email) {
                            setRecipientEmail(user.email);
                          }
                        }
                      }}
                      className="w-full border rounded px-3 py-2"
                    >
                      <option value="">-- Select User --</option>
                      {employees.map((emp: any) => (
                        <option key={emp.id} value={emp.id}>
                          {emp.name || emp.username} {emp.email ? `(${emp.email})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-sm font-medium text-gray-700">Items</label>
                      <button
                        type="button"
                        onClick={handleAddItem}
                        className="px-3 py-1 text-sm rounded bg-gray-100 hover:bg-gray-200"
                      >
                        + Add Item
                      </button>
                    </div>
                    <div className="border rounded-lg overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-b">
                          <tr>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-700">Description</th>
                            <th className="px-3 py-2 text-right text-xs font-medium text-gray-700">Qty</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-700">Unit</th>
                            <th className="px-3 py-2 text-right text-xs font-medium text-gray-700">Unit Price</th>
                            <th className="px-3 py-2 text-right text-xs font-medium text-gray-700">Total</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-700">Notes</th>
                            <th className="px-3 py-2"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {orderItems.map((item) => (
                            <tr key={item.id}>
                              <td className="px-3 py-2">
                                <input
                                  type="text"
                                  placeholder="Item description"
                                  value={item.name}
                                  onChange={(e) => handleItemChange(item.id, 'name', e.target.value)}
                                  className="w-full border rounded px-2 py-1 text-sm"
                                  required
                                />
                              </td>
                              <td className="px-3 py-2">
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  value={item.quantity}
                                  onChange={(e) => handleItemChange(item.id, 'quantity', parseFloat(e.target.value) || 0)}
                                  className="w-20 border rounded px-2 py-1 text-sm text-right"
                                  required
                                />
                              </td>
                              <td className="px-3 py-2">
                                <input
                                  type="text"
                                  placeholder="Unit"
                                  value={item.unit || ''}
                                  onChange={(e) => handleItemChange(item.id, 'unit', e.target.value)}
                                  className="w-20 border rounded px-2 py-1 text-sm"
                                />
                              </td>
                              <td className="px-3 py-2">
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  value={item.unit_price}
                                  onChange={(e) => handleItemChange(item.id, 'unit_price', parseFloat(e.target.value) || 0)}
                                  className="w-24 border rounded px-2 py-1 text-sm text-right"
                                  required
                                />
                              </td>
                              <td className="px-3 py-2 text-right text-sm font-medium">
                                ${item.total_price.toFixed(2)}
                              </td>
                              <td className="px-3 py-2">
                                <input
                                  type="text"
                                  placeholder="Optional"
                                  value={item.notes || ''}
                                  onChange={(e) => handleItemChange(item.id, 'notes', e.target.value)}
                                  className="w-full border rounded px-2 py-1 text-sm"
                                />
                              </td>
                              <td className="px-3 py-2">
                                {orderItems.length > 1 && (
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveItem(item.id)}
                                    className="text-red-600 hover:text-red-800 text-sm"
                                  >
                                    ×
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
        
        <div className="p-4 border-t bg-gray-50 flex items-center justify-between">
          <div>
            {step === 2 && (
              <button
                onClick={() => {
                  onStepChange(1);
                  onOrderTypeSelect(null);
                }}
                className="px-4 py-2 rounded bg-gray-200 hover:bg-gray-300 text-gray-800 text-sm"
              >
                ← Back
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded bg-gray-200 hover:bg-gray-300 text-gray-800 text-sm"
            >
              Cancel
            </button>
            {step === 2 && (
              <button
                onClick={handleSaveAsDraft}
                className="px-4 py-2 rounded bg-brand-red text-white text-sm hover:bg-red-700"
              >
                Save as Draft
              </button>
            )}
          </div>
        </div>
      </div>
      
      {/* Product Search Modal */}
      {productSearchModalOpen && (
        <SupplierProductModalForOrder
          open={!!productSearchModalOpen}
          itemId={productSearchModalOpen.itemId}
          supplierName={selectedSupplierName}
          supplierId={supplierId}
          onSelect={(product) => handleProductSelect(productSearchModalOpen.itemId, product)}
          onClose={() => setProductSearchModalOpen(null)}
        />
      )}
    </div>
  );
}

// Add Product Modal for Order (without supplier filter)
function AddProductModalForOrder({ 
  open, 
  itemId, 
  onSelect, 
  onClose 
}: { 
  open: boolean; 
  itemId: string; 
  onSelect: (product: any) => void; 
  onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const [selection, setSelection] = useState<any>(null);
  const [displayedCount, setDisplayedCount] = useState(5);
  
  const { data: allResults = [] } = useQuery<any[]>({
    queryKey: ['mat-search-order', q],
    queryFn: async () => {
      if (!q.trim()) return [];
      const params = new URLSearchParams();
      params.set('q', q);
      return await api<any[]>('GET', `/estimate/products/search?${params.toString()}`);
    },
    enabled: open && !!q.trim()
  });
  
  const list = allResults.slice(0, displayedCount);
  const hasMore = allResults.length > displayedCount;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) {
      setQ('');
      setSelection(null);
      setDisplayedCount(5);
    }
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] bg-black/60 flex items-center justify-center">
      <div className="w-[720px] max-w-[95vw] bg-white rounded-xl overflow-hidden max-h-[90vh] flex flex-col">
        <div className="bg-gradient-to-br from-[#7f1010] to-[#a31414] p-6 flex items-center gap-6 relative flex-shrink-0">
          <div className="font-semibold text-lg text-white">Add Product</div>
          <button onClick={onClose} className="ml-auto text-white hover:text-gray-200 text-2xl font-bold w-8 h-8 flex items-center justify-center rounded hover:bg-white/20" title="Close">×</button>
        </div>
        <div className="p-4 space-y-3 overflow-y-auto flex-1">
          <div className="flex-1">
            <label className="text-xs text-gray-600">Search Product:</label>
            <input className="w-full border rounded px-3 py-2" placeholder="Type product name..." value={q} onChange={e => setQ(e.target.value)} />
          </div>
          {q.trim() && list.length > 0 && (
            <div className="max-h-64 overflow-auto rounded border divide-y">
              {list.map(p => (
                <button key={p.id} onClick={() => setSelection(p)} className={`w-full text-left px-3 py-2 bg-white hover:bg-gray-50 ${selection?.id === p.id ? 'ring-2 ring-brand-red' : ''}`}>
                  <div className="font-medium">{p.name}</div>
                  <div className="text-xs text-gray-500">{p.supplier_name || ''} · {p.unit || ''} · ${Number(p.price || 0).toFixed(2)}</div>
                </button>
              ))}
              {hasMore && (
                <button
                  onClick={() => setDisplayedCount(prev => prev + 5)}
                  className="w-full text-center px-3 py-2 bg-gray-50 hover:bg-gray-100 text-sm text-gray-600 border-t">
                  Load more ({allResults.length - displayedCount} remaining)
                </button>
              )}
            </div>
          )}
          {selection && (
            <div className="border rounded p-3 bg-gray-50 space-y-2">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-24 h-24 relative">
                  {selection.image_base64 ? (
                    <img 
                      src={selection.image_base64.startsWith('data:') ? selection.image_base64 : `data:image/jpeg;base64,${selection.image_base64}`}
                      alt={selection.name}
                      className="w-full h-full object-contain rounded"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                        const placeholder = (e.target as HTMLImageElement).nextElementSibling as HTMLElement;
                        if (placeholder) placeholder.style.display = 'flex';
                      }}
                    />
                  ) : null}
                  <div className={`w-full h-full bg-gray-200 rounded flex items-center justify-center text-gray-400 text-xs ${selection.image_base64 ? 'hidden' : ''}`} style={{ display: selection.image_base64 ? 'none' : 'flex' }}>
                    No Image
                  </div>
                </div>
                <div className="flex-1 space-y-2">
                  <div className="font-medium">{selection.name}</div>
                  <div className="text-sm text-gray-600">Supplier: {selection.supplier_name || 'N/A'}</div>
                  <div className="text-sm text-gray-600">Unit: {selection.unit || '-'} · Price: ${Number(selection.price || 0).toFixed(2)}</div>
                </div>
              </div>
            </div>
          )}
          <div className="text-right">
            <button onClick={() => {
              if (!selection) { 
                toast.error('Select a product first'); 
                return; 
              }
              onSelect(selection);
            }} className="px-3 py-2 rounded text-white bg-gradient-to-br from-[#7f1010] to-[#a31414] hover:from-[#6d0d0d] hover:to-[#8f1111]">Select Product</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Supplier Product Modal for Order (with or without supplier pre-selected)
function SupplierProductModalForOrder({ 
  open, 
  itemId, 
  supplierName, 
  supplierId,
  onSelect, 
  onClose 
}: { 
  open: boolean; 
  itemId: string; 
  supplierName: string | null;
  supplierId?: string;
  onSelect: (product: any) => void; 
  onClose: () => void;
}) {
  const [selectedSupplier, setSelectedSupplier] = useState<string | null>(supplierId || null);
  const [displayedProductCount, setDisplayedProductCount] = useState(20);
  
  const { data: suppliers } = useQuery<any[]>({
    queryKey: ['suppliers-modal'],
    queryFn: async () => {
      const suppliers = await api<{id: string, name: string}[]>('GET', '/inventory/suppliers');
      return suppliers;
    },
    enabled: open
  });
  
  const { data: allProducts } = useQuery<any[]>({
    queryKey: ['all-products-supplier', selectedSupplier],
    queryFn: async () => {
      return await api<any[]>('GET', '/estimate/products');
    },
    enabled: open
  });

  // Use selectedSupplier from state, or fallback to supplierName from props
  const activeSupplierName = useMemo(() => {
    // If supplierId is provided (pre-selected), prefer supplierName from props first
    if (supplierId && supplierName) {
      return supplierName;
    }
    // Otherwise, use selectedSupplier from state
    if (selectedSupplier) {
      const supplier = suppliers?.find(s => s.id === selectedSupplier);
      return supplier?.name || null;
    }
    // Fallback to supplierName from props
    return supplierName || null;
  }, [selectedSupplier, supplierName, supplierId, suppliers]);

  const allProductsForSupplier = useMemo(() => {
    if (!activeSupplierName || !allProducts) return [];
    return allProducts.filter(p => p.supplier_name === activeSupplierName);
  }, [allProducts, activeSupplierName]);

  const products = useMemo(() => {
    return allProductsForSupplier.slice(0, displayedProductCount);
  }, [allProductsForSupplier, displayedProductCount]);

  const hasMoreProducts = allProductsForSupplier.length > displayedProductCount;

  useEffect(() => {
    // Update selectedSupplier whenever supplierId changes or modal opens
    if (open) {
      if (supplierId) {
        // If supplier is pre-selected, set it and lock it
        setSelectedSupplier(supplierId);
      } else {
        // If no supplierId, reset to null to show all suppliers
        setSelectedSupplier(null);
      }
    }
  }, [open, supplierId]);

  useEffect(() => {
    if (selectedSupplier) {
      setDisplayedProductCount(20);
    }
  }, [selectedSupplier]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] bg-black/60 flex items-center justify-center p-4">
      <div className={`${supplierId ? 'w-[1200px]' : 'w-[1000px]'} max-w-[95vw] bg-white rounded-xl overflow-hidden max-h-[90vh] flex flex-col`}>
        <div className="bg-gradient-to-br from-[#7f1010] to-[#a31414] p-6 flex items-center gap-6 relative flex-shrink-0">
          <div className="font-semibold text-lg text-white">
            {supplierId ? `Products from ${activeSupplierName || 'Supplier'}` : 'Browse Products by Supplier'}
          </div>
          <button onClick={onClose} className="ml-auto text-white hover:text-gray-200 text-2xl font-bold w-8 h-8 flex items-center justify-center rounded hover:bg-white/20" title="Close">×</button>
        </div>
        <div className="flex flex-1 overflow-hidden">
          {/* Left: Suppliers List - Only show if no supplier is pre-selected */}
          {!supplierId && (
            <div className="w-64 border-r overflow-y-auto bg-gray-50">
              <div className="p-4">
                <div className="font-semibold mb-3 text-sm text-gray-700">Suppliers</div>
                <div className="space-y-2">
                  {(suppliers || []).map(supplier => (
                    <button
                      key={supplier.id}
                      onClick={() => setSelectedSupplier(supplier.id)}
                      className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
                        selectedSupplier === supplier.id
                          ? 'text-white bg-gradient-to-br from-[#7f1010] to-[#a31414]'
                          : 'bg-white hover:bg-gray-100 text-gray-700'
                      }`}>
                      {supplier.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
          
          {/* Right: Products Grid */}
          <div className={`flex-1 overflow-y-auto p-4`}>
            {!activeSupplierName ? (
              <div className="flex items-center justify-center h-full text-gray-500">
                {supplierId ? 'Loading products...' : 'Select a supplier to view products'}
              </div>
            ) : (
              <div>
                <div className="font-semibold mb-4 text-gray-700">
                  Products from {activeSupplierName}
                </div>
                {products && products.length > 0 ? (
                  <>
                    <div className="grid grid-cols-4 gap-3">
                      {products.map(product => (
                        <button
                          key={product.id}
                          onClick={() => onSelect(product)}
                          className="border rounded-lg p-3 hover:border-brand-red hover:shadow-md transition-all text-left bg-white flex flex-col">
                          <div className="w-full h-24 mb-2 relative">
                            {product.image_base64 ? (
                              <img 
                                src={product.image_base64.startsWith('data:') ? product.image_base64 : `data:image/jpeg;base64,${product.image_base64}`}
                                alt={product.name}
                                className="w-full h-full object-contain rounded"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display = 'none';
                                  const placeholder = (e.target as HTMLImageElement).nextElementSibling as HTMLElement;
                                  if (placeholder) placeholder.style.display = 'flex';
                                }}
                              />
                            ) : null}
                            <div className={`w-full h-full bg-gray-200 rounded flex items-center justify-center text-gray-400 text-xs ${product.image_base64 ? 'hidden' : ''}`} style={{ display: product.image_base64 ? 'none' : 'flex' }}>
                              No Image
                            </div>
                          </div>
                          <div className="font-medium text-sm mb-1 line-clamp-2">{product.name}</div>
                          {product.category && (
                            <div className="text-xs text-gray-500 mb-1">{product.category}</div>
                          )}
                          <div className="text-xs text-red-600 font-semibold mt-auto">
                            ${Number(product.price || 0).toFixed(2)}
                          </div>
                          {product.unit && (
                            <div className="text-xs text-gray-500">Unit: {product.unit}</div>
                          )}
                        </button>
                      ))}
                    </div>
                    {hasMoreProducts && (
                      <button
                        onClick={() => setDisplayedProductCount(prev => prev + 20)}
                        className="w-full mt-4 text-center px-4 py-2 bg-gray-100 hover:bg-gray-200 text-sm text-gray-700 rounded">
                        Load more ({allProductsForSupplier.length - displayedProductCount} remaining)
                      </button>
                    )}
                  </>
                ) : (
                  <div className="flex items-center justify-center h-64 text-gray-500">
                    No products found for this supplier
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

