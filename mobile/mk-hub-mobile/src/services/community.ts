import { api } from "./api";
import type { CommunityPost, CommunityComment } from "../types/community";

// Community posts API:
// - GET /community/posts?filter=...
// - POST /community/posts/{id}/mark-viewed
// - POST /community/posts/{id}/like
// - GET /community/posts/{id}/comments
// - POST /community/posts/{id}/comments

export const getCommunityPosts = async (
  filter?: "all" | "unread" | "required" | "announcements"
): Promise<CommunityPost[]> => {
  const response = await api.get<CommunityPost[]>("/community/posts", {
    params: filter ? { filter } : undefined
  });
  return response.data;
};

export const markPostViewed = async (postId: string): Promise<void> => {
  await api.post(`/community/posts/${postId}/mark-viewed`);
};

export const togglePostLike = async (postId: string): Promise<{
  status: "liked" | "unliked";
  likes_count: number;
  user_has_liked: boolean;
}> => {
  const response = await api.post(`/community/posts/${postId}/like`);
  return response.data;
};

export const getPostComments = async (postId: string): Promise<CommunityComment[]> => {
  const response = await api.get<CommunityComment[]>(`/community/posts/${postId}/comments`);
  return response.data;
};

export const createPostComment = async (
  postId: string,
  content: string
): Promise<CommunityComment> => {
  const response = await api.post<CommunityComment>(`/community/posts/${postId}/comments`, {
    content
  });
  return response.data;
};

