export const COMMUNITY_GROUP_DESCRIPTION_MAX_LEN = 8000;

export type CommunityGroupSummary = {
  id: string;
  name: string;
  description?: string | null;
  photo_file_id?: string | null;
  member_count?: number;
  created_by_id?: string | null;
  is_owner?: boolean;
  created_at?: string | null;
  updated_at?: string | null;
};

export type CommunityGroupDetail = CommunityGroupSummary & {
  member_ids?: string[];
};

export type ManageGroupTab = 'details' | 'members' | 'danger';
