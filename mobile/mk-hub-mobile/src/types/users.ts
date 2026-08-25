export type HrUserTabKey = "personal" | "job" | "permissions";

export interface HubUserListItem {
  id: string;
  username: string;
  email?: string | null;
  name?: string | null;
  roles?: string[];
  is_active?: boolean;
  profile_photo_file_id?: string | null;
  job_title?: string | null;
  phone?: string | null;
  mobile_phone?: string | null;
  manager_user_id?: string | null;
  divisions?: Array<{ id: string; label: string }>;
}

export interface HubUsersListResponse {
  items: HubUserListItem[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}

export interface HubUsersTabCounts {
  active: number;
  inactive: number;
  admins: number;
}

export interface HubUserAccount {
  id: string;
  username: string;
  email?: string | null;
  is_active?: boolean;
  divisions?: Array<{ id: string; label: string }>;
}

export interface HubUserProfile {
  first_name?: string | null;
  last_name?: string | null;
  middle_name?: string | null;
  preferred_name?: string | null;
  gender?: string | null;
  date_of_birth?: string | null;
  marital_status?: string | null;
  nationality?: string | null;
  phone?: string | null;
  mobile_phone?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  province?: string | null;
  postal_code?: string | null;
  country?: string | null;
  hire_date?: string | null;
  termination_date?: string | null;
  job_title?: string | null;
  division?: string | null;
  manager_user_id?: string | null;
  work_email?: string | null;
  work_phone?: string | null;
  pay_rate?: string | number | null;
  pay_type?: string | null;
  employment_type?: string | null;
  profile_photo_file_id?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_relationship?: string | null;
  emergency_contact_phone?: string | null;
}

export interface HubUserProfileResponse {
  user: HubUserAccount;
  profile: HubUserProfile | null;
}

export interface HubPermissionItem {
  id: string;
  key: string;
  label: string;
  description?: string | null;
  is_granted: boolean;
}

export interface HubPermissionCategoryGroup {
  category: {
    id: string;
    name: string;
    label: string;
    description?: string | null;
  };
  permissions: HubPermissionItem[];
}

export interface HubUserPermissionsResponse {
  user_id: string;
  username: string;
  permissions_by_category: HubPermissionCategoryGroup[];
  permissions_map?: Record<string, boolean>;
}

export interface HubPermissionTemplate {
  id: string;
  name: string;
  permission_keys: string[];
}
