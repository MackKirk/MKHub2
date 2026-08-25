export interface TimeOffBalance {
  id: string;
  policy_name: string;
  balance_hours: number;
  accrued_hours: number;
  used_hours: number;
  year: number;
  last_synced_at?: string | null;
}

export interface TimeOffRequest {
  id: string;
  policy_name: string;
  start_date: string;
  end_date: string;
  hours: number;
  notes?: string | null;
  status: "pending" | "approved" | "rejected" | "cancelled";
  requested_at: string;
  reviewed_at?: string | null;
  review_notes?: string | null;
}

export interface TimeOffHistoryItem {
  id: string;
  policy_name: string;
  transaction_date: string;
  description?: string | null;
  used_days?: number | null;
  earned_days?: number | null;
  balance_after: number;
}

export interface CreateTimeOffPayload {
  policy_name: string;
  start_date: string;
  end_date: string;
  hours?: number;
  notes?: string;
}
