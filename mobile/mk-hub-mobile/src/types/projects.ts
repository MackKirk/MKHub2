export interface ProjectListItem {
  id: string;
  code: string;
  name: string;
  slug?: string;
  client_id?: string;
  created_at?: string;
  date_start?: string;
  date_end?: string;
  progress?: number;
  status_label?: string;
  is_bidding?: boolean;
  client_display_name?: string;
  client_name?: string;
}


