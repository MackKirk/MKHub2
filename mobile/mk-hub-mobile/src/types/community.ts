export interface CommunityPost {
  id: string;
  title: string;
  content: string;
  author_id: string;
  author_name?: string;
  author_avatar?: string;
  photo_url?: string;
  document_url?: string;
  created_at: string;
  tags?: string[];
  likes_count: number;
  comments_count: number;
  is_unread: boolean;
  is_urgent: boolean;
  requires_read_confirmation: boolean;
  user_has_liked: boolean;
  user_has_confirmed: boolean;
}

export interface CommunityComment {
  id: string;
  user_id: string;
  user_name?: string;
  user_avatar?: string;
  content: string;
  created_at: string;
}

