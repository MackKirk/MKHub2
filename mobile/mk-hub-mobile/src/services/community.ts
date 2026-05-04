import { api } from "./api";
import type { CommunityPost, CommunityComment } from "../types/community";

// Community posts API:
// - GET /community/posts?filter=...
// - POST /community/posts/{id}/mark-viewed
// - POST /community/posts/{id}/like
// - GET /community/posts/{id}/comments
// - POST /community/posts/{id}/comments

export type CommunityPostsParams = {
  filter?: "all" | "unread" | "required" | "announcements" | "urgent";
  q?: string;
  related_area?: string;
  priority?: string;
  confirmed_only?: boolean;
};

export const getCommunityPosts = async (
  filterOrParams?: CommunityPostsParams["filter"] | CommunityPostsParams
): Promise<CommunityPost[]> => {
  let params: Record<string, string | boolean> | undefined;
  if (typeof filterOrParams === "string" || filterOrParams === undefined) {
    params = filterOrParams ? { filter: filterOrParams } : { filter: "all" };
  } else {
    params = {};
    if (filterOrParams.filter) params.filter = filterOrParams.filter;
    if (filterOrParams.q) params.q = filterOrParams.q;
    if (filterOrParams.related_area) params.related_area = filterOrParams.related_area;
    if (filterOrParams.priority) params.priority = filterOrParams.priority;
    if (filterOrParams.confirmed_only) params.confirmed_only = "true";
  }
  const response = await api.get<CommunityPost[]>("/community/posts", { params });
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
  content: string,
  options?: { parent_comment_id?: string; mentions?: { entity_type: string; entity_id: string }[] }
): Promise<CommunityComment> => {
  const response = await api.post<CommunityComment>(`/community/posts/${postId}/comments`, {
    content,
    parent_comment_id: options?.parent_comment_id,
    mentions: options?.mentions?.length ? options.mentions : undefined
  });
  return response.data;
};

