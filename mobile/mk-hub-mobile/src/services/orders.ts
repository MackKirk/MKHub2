import { api } from "./api";

export interface ProjectOrder {
  id: string;
  project_id: string;
  order_type: string;
  order_code?: string;
  status: string;
  supplier_id?: string;
  supplier_name?: string;
  supplier_email?: string;
  notes?: string;
  created_at?: string;
  items?: ProjectOrderItem[];
}

export interface ProjectOrderItem {
  id: string;
  order_id: string;
  material_id?: string;
  item_type?: string;
  description?: string;
  quantity?: number;
  unit?: string;
  unit_price?: number;
  total?: number;
}

export interface CreateOrderRequest {
  project_id: string;
  order_type: string;
  supplier_id?: string;
  supplier_email?: string;
  notes?: string;
  items: {
    description: string;
    quantity: number;
    unit?: string;
    unit_price?: number;
  }[];
}

// GET /orders/projects/{project_id}
export const getProjectOrders = async (projectId: string): Promise<ProjectOrder[]> => {
  const response = await api.get<ProjectOrder[]>(`/orders/projects/${projectId}`);
  return response.data;
};

// GET /orders/{order_id}
export const getOrder = async (orderId: string): Promise<ProjectOrder> => {
  const response = await api.get<ProjectOrder>(`/orders/${orderId}`);
  return response.data;
};

// POST /orders/projects/{project_id}/extra
export const createOrder = async (payload: CreateOrderRequest): Promise<any> => {
  const response = await api.post<any>(
    `/orders/projects/${payload.project_id}/extra`,
    {
      order_type: payload.order_type,
      supplier_id: payload.supplier_id,
      supplier_name: undefined, // Not supported in mobile
      supplier_email: payload.supplier_email,
      recipient_email: undefined, // Not supported in mobile
      recipient_user_id: undefined, // Not supported in mobile
      notes: payload.notes,
      items: payload.items.map((item) => ({
        name: item.description,
        description: item.description,
        quantity: item.quantity,
        unit: item.unit,
        unit_price: item.unit_price || 0,
        item_type: payload.order_type === "subcontractor" ? "subcontractor" : "product"
      }))
    }
  );
  return response.data;
};

// PATCH /orders/{order_id} with status="delivered"
export const approveOrderReceipt = async (orderId: string): Promise<{ status: string }> => {
  const response = await api.patch<{ status: string }>(`/orders/${orderId}`, {
    status: "delivered"
  });
  return response.data;
};

