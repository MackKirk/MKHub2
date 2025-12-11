import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ViewStyle
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "../../theme/colors";
import { spacing } from "../../theme/spacing";
import { MKButton } from "../../components/MKButton";
import { MKCard } from "../../components/MKCard";
import {
  getCommunityPosts,
  markPostViewed,
  togglePostLike,
  getPostComments,
  createPostComment
} from "../../services/community";
import { toApiError } from "../../services/api";
import type { CommunityPost, CommunityComment } from "../../types/community";

type Filter = "all" | "unread" | "required" | "announcements";

export const CommunityScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedPost, setSelectedPost] = useState<CommunityPost | null>(null);
  const [comments, setComments] = useState<CommunityComment[]>([]);
  const [commentText, setCommentText] = useState("");
  const [loadingComments, setLoadingComments] = useState(false);
  const [submittingComment, setSubmittingComment] = useState(false);

  const loadPosts = async () => {
    try {
      setLoading(true);
      const data = await getCommunityPosts(filter);
      setPosts(data);
    } catch (err) {
      const apiError = toApiError(err);
      Alert.alert("Could not load posts", apiError.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPosts();
  }, [filter]);

  const handlePostPress = async (post: CommunityPost) => {
    setSelectedPost(post);
    if (post.is_unread) {
      try {
        await markPostViewed(post.id);
        // Update local state
        setPosts((prev) =>
          prev.map((p) => (p.id === post.id ? { ...p, is_unread: false } : p))
        );
      } catch (err) {
        // Silent fail
      }
    }
    loadComments(post.id);
  };

  const loadComments = async (postId: string) => {
    try {
      setLoadingComments(true);
      const data = await getPostComments(postId);
      setComments(data);
    } catch (err) {
      // Silent fail
    } finally {
      setLoadingComments(false);
    }
  };

  const handleLike = async (post: CommunityPost) => {
    try {
      const result = await togglePostLike(post.id);
      setPosts((prev) =>
        prev.map((p) =>
          p.id === post.id
            ? {
                ...p,
                user_has_liked: result.user_has_liked,
                likes_count: result.likes_count
              }
            : p
        )
      );
      if (selectedPost?.id === post.id) {
        setSelectedPost({
          ...selectedPost,
          user_has_liked: result.user_has_liked,
          likes_count: result.likes_count
        });
      }
    } catch (err) {
      const apiError = toApiError(err);
      Alert.alert("Error", apiError.message);
    }
  };

  const handleSubmitComment = async () => {
    if (!selectedPost || !commentText.trim()) return;

    try {
      setSubmittingComment(true);
      const newComment = await createPostComment(selectedPost.id, commentText.trim());
      setComments([...comments, newComment]);
      setCommentText("");
      setPosts((prev) =>
        prev.map((p) =>
          p.id === selectedPost.id ? { ...p, comments_count: p.comments_count + 1 } : p
        )
      );
      if (selectedPost) {
        setSelectedPost({
          ...selectedPost,
          comments_count: selectedPost.comments_count + 1
        });
      }
    } catch (err) {
      const apiError = toApiError(err);
      Alert.alert("Error", apiError.message);
    } finally {
      setSubmittingComment(false);
    }
  };

  const renderPost = ({ item }: { item: CommunityPost }) => {
    const hasTags = item.tags && item.tags.length > 0;
    const isUrgent = item.is_urgent || item.tags?.includes("Urgent");
    const cardStyle: ViewStyle = item.is_unread 
      ? StyleSheet.flatten([styles.postCard, styles.postCardUnread])
      : styles.postCard;

    return (
      <MKCard
        style={cardStyle}
        onPress={() => handlePostPress(item)}
        elevated={true}
      >
        <View style={styles.postHeader}>
          <View style={styles.postHeaderLeft}>
            {item.author_avatar ? (
              <Image source={{ uri: item.author_avatar }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarText}>
                  {(item.author_name || "U")[0].toUpperCase()}
                </Text>
              </View>
            )}
            <View style={styles.postAuthorInfo}>
              <Text style={styles.postAuthor}>{item.author_name || "Unknown"}</Text>
              <Text style={styles.postDate}>
                {new Date(item.created_at).toLocaleDateString()}
              </Text>
            </View>
          </View>
          {item.is_unread && <View style={styles.unreadDot} />}
        </View>

        <Text style={styles.postTitle}>{item.title}</Text>
        <Text style={styles.postContent} numberOfLines={3}>
          {item.content}
        </Text>

        {item.photo_url && (
          <Image source={{ uri: item.photo_url }} style={styles.postImage} />
        )}

        {hasTags && (
          <View style={styles.tagsContainer}>
            {item.tags?.slice(0, 3).map((tag, idx) => (
              <View
                key={idx}
                style={[
                  styles.tag,
                  tag === "Urgent" && styles.tagUrgent,
                  tag === "Required" && styles.tagRequired
                ]}
              >
                <Text
                  style={[
                    styles.tagText,
                    (tag === "Urgent" || tag === "Required") && styles.tagTextWhite
                  ]}
                >
                  {tag}
                </Text>
              </View>
            ))}
          </View>
        )}

        <View style={styles.postFooter}>
          <TouchableOpacity
            style={styles.footerButton}
            onPress={(e) => {
              e.stopPropagation();
              handleLike(item);
            }}
          >
            <Text style={styles.footerIcon}>
              {item.user_has_liked ? "❤️" : "🤍"}
            </Text>
            <Text style={styles.footerText}>{item.likes_count}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.footerButton}>
            <Text style={styles.footerIcon}>💬</Text>
            <Text style={styles.footerText}>{item.comments_count}</Text>
          </TouchableOpacity>
        </View>
      </MKCard>
    );
  };

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Community</Text>
        <View style={styles.filterRow}>
          {(["all", "unread", "required", "announcements"] as Filter[]).map((f) => (
            <TouchableOpacity
              key={f}
              style={[styles.filterChip, filter === f && styles.filterChipActive]}
              onPress={() => setFilter(f)}
            >
              <Text
                style={[
                  styles.filterText,
                  filter === f && styles.filterTextActive
                ]}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {loading && posts.length === 0 ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading posts...</Text>
        </View>
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(item) => item.id}
          renderItem={renderPost}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={loading} onRefresh={loadPosts} />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>📭</Text>
              <Text style={styles.emptyText}>No posts found</Text>
            </View>
          }
        />
      )}

      {/* Post Detail Modal */}
      <Modal
        visible={selectedPost !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setSelectedPost(null)}
      >
        {selectedPost && (
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{selectedPost.title}</Text>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => {
                  setSelectedPost(null);
                  setComments([]);
                  setCommentText("");
                }}
              >
                <Text style={styles.closeButtonText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalContent}>
              <View style={styles.modalPostHeader}>
                {selectedPost.author_avatar ? (
                  <Image
                    source={{ uri: selectedPost.author_avatar }}
                    style={styles.modalAvatar}
                  />
                ) : (
                  <View style={styles.modalAvatarPlaceholder}>
                    <Text style={styles.modalAvatarText}>
                      {(selectedPost.author_name || "U")[0].toUpperCase()}
                    </Text>
                  </View>
                )}
                <View>
                  <Text style={styles.modalAuthor}>{selectedPost.author_name}</Text>
                  <Text style={styles.modalDate}>
                    {new Date(selectedPost.created_at).toLocaleString()}
                  </Text>
                </View>
              </View>

              <Text style={styles.modalContentText}>{selectedPost.content}</Text>

              {selectedPost.photo_url && (
                <Image
                  source={{ uri: selectedPost.photo_url }}
                  style={styles.modalImage}
                  resizeMode="contain"
                />
              )}

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={styles.modalActionButton}
                  onPress={() => handleLike(selectedPost)}
                >
                  <Text style={styles.modalActionIcon}>
                    {selectedPost.user_has_liked ? "❤️" : "🤍"}
                  </Text>
                  <Text style={styles.modalActionText}>
                    {selectedPost.likes_count}
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={styles.commentsSection}>
                <Text style={styles.commentsTitle}>Comments ({comments.length})</Text>
                {loadingComments ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  comments.map((comment) => (
                    <View key={comment.id} style={styles.comment}>
                      <View style={styles.commentHeader}>
                        {comment.user_avatar ? (
                          <Image
                            source={{ uri: comment.user_avatar }}
                            style={styles.commentAvatar}
                          />
                        ) : (
                          <View style={styles.commentAvatarPlaceholder}>
                            <Text style={styles.commentAvatarText}>
                              {(comment.user_name || "U")[0].toUpperCase()}
                            </Text>
                          </View>
                        )}
                        <View>
                          <Text style={styles.commentAuthor}>
                            {comment.user_name || "Unknown"}
                          </Text>
                          <Text style={styles.commentDate}>
                            {new Date(comment.created_at).toLocaleString()}
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.commentContent}>{comment.content}</Text>
                    </View>
                  ))
                )}
              </View>
            </ScrollView>

            <View style={styles.commentInputContainer}>
              <TextInput
                style={styles.commentInput}
                value={commentText}
                onChangeText={setCommentText}
                placeholder="Add a comment..."
                placeholderTextColor={colors.textMuted}
                multiline
              />
              <MKButton
                title="Post"
                onPress={handleSubmitComment}
                loading={submittingComment}
                disabled={!commentText.trim()}
                style={styles.commentButton}
              />
            </View>
          </View>
        )}
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: colors.textPrimary,
    marginBottom: spacing.md,
    letterSpacing: 0.5
  },
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  filterChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card
  },
  filterChipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary
  },
  filterText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textPrimary
  },
  filterTextActive: {
    color: "#ffffff"
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center"
  },
  loadingText: {
    marginTop: spacing.md,
    color: colors.textMuted,
    fontSize: 14
  },
  listContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl
  },
  postCard: {
    marginBottom: spacing.md
  },
  postCardUnread: {
    borderLeftWidth: 4,
    borderLeftColor: colors.primary
  },
  postHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.md
  },
  postHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: spacing.sm
  },
  avatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.sm
  },
  avatarText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 16
  },
  postAuthorInfo: {
    flex: 1
  },
  postAuthor: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textPrimary
  },
  postDate: {
    fontSize: 12,
    color: colors.textMuted
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary
  },
  postTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.textPrimary,
    marginBottom: spacing.xs
  },
  postContent: {
    fontSize: 14,
    color: colors.textPrimary,
    lineHeight: 20,
    marginBottom: spacing.sm
  },
  postImage: {
    width: "100%",
    height: 200,
    borderRadius: 8,
    marginBottom: spacing.sm
  },
  tagsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: spacing.sm,
    gap: spacing.xs
  },
  tag: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 12,
    backgroundColor: colors.border
  },
  tagUrgent: {
    backgroundColor: colors.error
  },
  tagRequired: {
    backgroundColor: colors.warning
  },
  tagText: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.textPrimary
  },
  tagTextWhite: {
    color: "#ffffff"
  },
  postFooter: {
    flexDirection: "row",
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border
  },
  footerButton: {
    flexDirection: "row",
    alignItems: "center",
    marginRight: spacing.lg
  },
  footerIcon: {
    fontSize: 18,
    marginRight: spacing.xs
  },
  footerText: {
    fontSize: 14,
    color: colors.textMuted
  },
  emptyContainer: {
    alignItems: "center",
    paddingVertical: spacing.xxl
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: spacing.md
  },
  emptyText: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.textPrimary
  },
  modalContainer: {
    flex: 1,
    backgroundColor: colors.background
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: spacing.lg,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.textPrimary,
    flex: 1
  },
  closeButton: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center"
  },
  closeButtonText: {
    fontSize: 24,
    color: colors.textMuted
  },
  modalContent: {
    flex: 1,
    padding: spacing.lg
  },
  modalPostHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.md
  },
  modalAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    marginRight: spacing.md
  },
  modalAvatarPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.md
  },
  modalAvatarText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 20
  },
  modalAuthor: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.textPrimary
  },
  modalDate: {
    fontSize: 12,
    color: colors.textMuted
  },
  modalContentText: {
    fontSize: 16,
    color: colors.textPrimary,
    lineHeight: 24,
    marginBottom: spacing.lg
  },
  modalImage: {
    width: "100%",
    height: 300,
    borderRadius: 8,
    marginBottom: spacing.lg
  },
  modalActions: {
    flexDirection: "row",
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.lg
  },
  modalActionButton: {
    flexDirection: "row",
    alignItems: "center",
    marginRight: spacing.lg
  },
  modalActionIcon: {
    fontSize: 20,
    marginRight: spacing.xs
  },
  modalActionText: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.textPrimary
  },
  commentsSection: {
    marginTop: spacing.lg
  },
  commentsTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.textPrimary,
    marginBottom: spacing.md
  },
  comment: {
    marginBottom: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  commentHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.xs
  },
  commentAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: spacing.sm
  },
  commentAvatarPlaceholder: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.sm
  },
  commentAvatarText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 12
  },
  commentAuthor: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textPrimary
  },
  commentDate: {
    fontSize: 11,
    color: colors.textMuted
  },
  commentContent: {
    fontSize: 14,
    color: colors.textPrimary,
    lineHeight: 20,
    marginLeft: 40
  },
  commentInputContainer: {
    flexDirection: "row",
    padding: spacing.lg,
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.border
  },
  commentInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginRight: spacing.sm,
    fontSize: 14,
    color: colors.textPrimary,
    maxHeight: 100
  },
  commentButton: {
    minWidth: 80
  }
});

