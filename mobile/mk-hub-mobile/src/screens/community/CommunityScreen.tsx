import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useNavigation, useRoute } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "../../theme/colors";
import { typography } from "../../theme/typography";
import { spacing } from "../../theme/spacing";
import { radius, shadows } from "../../theme/radius";
import { ScreenLayout } from "../../components/ScreenLayout";
import { useHubMenu } from "../../navigation/HubMenuProvider";
import { useAuth } from "../../hooks/useAuth";
import { useCommunityBadge } from "../../hooks/useCommunityBadge";
import {
  getCommunityPosts,
  markPostViewed,
  confirmPostRead,
  togglePostLike,
  getPostComments,
  createPostComment
} from "../../services/community";
import { toApiError } from "../../services/api";
import type { CommunityPost, CommunityComment } from "../../types/community";
import type { AppTabParamList } from "../../navigation/types";
import { stripHtmlToPlain } from "../../utils/stripHtml";
import { isImageContentType, resolveFileUrl } from "../../lib/fileUrls";

type Filter = "all" | "unread" | "required" | "announcements" | "urgent";

const GLOBE_BG = require("../../../assets/brand/globe.png");
const RAIL_WIDTH = 6;
const ACCENT = colors.homeAccent;

const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: "all", label: "All" },
  { key: "unread", label: "Unread" },
  { key: "urgent", label: "Urgent" },
  { key: "required", label: "Required" },
  { key: "announcements", label: "News" }
];

function postDownloadAttachments(
  post: CommunityPost
): { key: string; url: string; name: string }[] {
  if (Array.isArray(post.attachments) && post.attachments.length > 0) {
    return post.attachments.map((a) => ({
      key: a.file_id || a.url,
      url: a.url,
      name: a.original_name || "Attachment"
    }));
  }
  if (post.document_url) {
    return [
      {
        key: post.document_file_id || post.document_url,
        url: post.document_url,
        name: post.document_original_name || "Attachment"
      }
    ];
  }
  return [];
}

function urlsMatch(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false;
  const strip = (value: string) => value.split("?")[0].replace(/\/$/, "");
  const left = strip(a);
  const right = strip(b);
  return left === right || left.endsWith(right) || right.endsWith(left);
}

function isImageFile(name: string, url: string): boolean {
  return isImageContentType(null, name) || isImageContentType(null, url);
}

function htmlToReadableText(html: string): string {
  return String(html || "")
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/h[1-6]>/gi, "\n\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function firstImageFromHtml(html?: string): string | null {
  if (!html) return null;
  const match = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  return match?.[1] ?? null;
}

function postPreviewImage(post: CommunityPost, token: string | null): string | null {
  if (post.photo_url) return resolveFileUrl(post.photo_url, token);
  const fromHtml = firstImageFromHtml(post.content);
  if (fromHtml) return resolveFileUrl(fromHtml, token);
  const imageAtt = post.attachments?.find(
    (att) =>
      isImageContentType(null, att.original_name) ||
      isImageContentType(null, att.url)
  );
  if (imageAtt?.url) return resolveFileUrl(imageAtt.url, token);
  return null;
}

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.max(0, Math.floor(diffMs / 60000));
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric"
  });
}

function isUrgentPost(post: CommunityPost): boolean {
  return (
    post.priority === "urgent" ||
    post.priority === "critical" ||
    Boolean(post.is_urgent) ||
    Boolean(post.tags?.includes("Urgent"))
  );
}

function postRail(post: CommunityPost): readonly [string, string] {
  if (isUrgentPost(post)) return ["#B91C1C", "#F87171"];
  if (post.is_unread) return ["#C22033", "#F87171"];
  return ["#147D36", "#4ADE80"];
}

export const CommunityScreen: React.FC = () => {
  const { openMenu } = useHubMenu();
  const { token } = useAuth();
  const insets = useSafeAreaInsets();
  const navigation =
    useNavigation<BottomTabNavigationProp<AppTabParamList, "Community">>();
  const route = useRoute<RouteProp<AppTabParamList, "Community">>();
  const pendingPostIdRef = useRef<string | null>(null);
  const { unreadCount, refreshUnread, markOneReadLocally } = useCommunityBadge();
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedPost, setSelectedPost] = useState<CommunityPost | null>(null);
  const [comments, setComments] = useState<CommunityComment[]>([]);
  const [commentText, setCommentText] = useState("");
  const [loadingComments, setLoadingComments] = useState(false);
  const [submittingComment, setSubmittingComment] = useState(false);
  const [confirmingRead, setConfirmingRead] = useState(false);

  const communitySummary = useMemo(() => {
    if (unreadCount === 0) return "You're all caught up";
    return unreadCount === 1 ? "1 unread post" : `${unreadCount} unread posts`;
  }, [unreadCount]);

  const detailBannerUri = selectedPost
    ? postPreviewImage(selectedPost, token)
    : null;
  const detailBodyText = selectedPost
    ? htmlToReadableText(selectedPost.content)
    : "";
  const detailAttachments = selectedPost
    ? postDownloadAttachments(selectedPost).filter((att) => {
        const uri = resolveFileUrl(att.url, token);
        if (detailBannerUri && uri && urlsMatch(detailBannerUri, uri)) return false;
        if (
          selectedPost.photo_url &&
          urlsMatch(att.url, selectedPost.photo_url)
        ) {
          return false;
        }
        return true;
      })
    : [];

  const loadPosts = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getCommunityPosts(filter);
      setPosts(Array.isArray(data) ? data : []);
      void refreshUnread();
    } catch (err) {
      Alert.alert("Could not load posts", toApiError(err).message);
    } finally {
      setLoading(false);
    }
  }, [filter, refreshUnread]);

  useFocusEffect(
    useCallback(() => {
      void loadPosts();
    }, [loadPosts])
  );

  useEffect(() => {
    const postId = route.params?.postId;
    if (!postId) return;
    pendingPostIdRef.current = postId;
    navigation.setParams({ postId: undefined });
  }, [route.params?.postId, navigation]);

  const closeDetail = () => {
    setSelectedPost(null);
    setComments([]);
    setCommentText("");
  };

  const loadComments = useCallback(async (postId: string) => {
    try {
      setLoadingComments(true);
      const data = await getPostComments(postId);
      setComments(data);
    } catch {
      // Silent fail
    } finally {
      setLoadingComments(false);
    }
  }, []);

  const handlePostPress = useCallback(
    async (post: CommunityPost) => {
      setSelectedPost(post);
      if (post.is_unread) {
        try {
          await markPostViewed(post.id);
          setPosts((prev) =>
            prev.map((p) => (p.id === post.id ? { ...p, is_unread: false } : p))
          );
          markOneReadLocally();
        } catch {
          // Silent fail
        }
      }
      void loadComments(post.id);
    },
    [loadComments, markOneReadLocally]
  );

  useEffect(() => {
    const postId = pendingPostIdRef.current;
    if (!postId || loading) return;

    const fromList = posts.find((item) => item.id === postId);
    if (fromList) {
      pendingPostIdRef.current = null;
      void handlePostPress(fromList);
      return;
    }

    let cancelled = false;
    void getCommunityPosts("all")
      .then((data) => {
        if (cancelled || pendingPostIdRef.current !== postId) return;
        const found = (Array.isArray(data) ? data : []).find(
          (item) => item.id === postId
        );
        pendingPostIdRef.current = null;
        setFilter("all");
        setPosts(Array.isArray(data) ? data : []);
        if (found) void handlePostPress(found);
      })
      .catch(() => {
        pendingPostIdRef.current = null;
      });

    return () => {
      cancelled = true;
    };
  }, [handlePostPress, loading, posts]);

  const handleConfirmRead = async (post: CommunityPost) => {
    if (!post.requires_read_confirmation || post.user_has_confirmed) return;
    try {
      setConfirmingRead(true);
      await confirmPostRead(post.id);
      const updated = { ...post, user_has_confirmed: true };
      setPosts((prev) => prev.map((p) => (p.id === post.id ? updated : p)));
      if (selectedPost?.id === post.id) setSelectedPost(updated);
    } catch (err) {
      Alert.alert("Could not confirm read", toApiError(err).message);
    } finally {
      setConfirmingRead(false);
    }
  };

  const applyLike = (postId: string, liked: boolean, likesCount: number) => {
    setPosts((prev) =>
      prev.map((p) =>
        p.id === postId
          ? { ...p, user_has_liked: liked, likes_count: likesCount }
          : p
      )
    );
    setSelectedPost((current) =>
      current?.id === postId
        ? { ...current, user_has_liked: liked, likes_count: likesCount }
        : current
    );
  };

  const handleLike = async (post: CommunityPost) => {
    try {
      const result = await togglePostLike(post.id);
      applyLike(post.id, result.user_has_liked, result.likes_count);
    } catch (err) {
      Alert.alert("Could not update like", toApiError(err).message);
    }
  };

  const handleSubmitComment = async () => {
    if (!selectedPost || !commentText.trim()) return;
    try {
      setSubmittingComment(true);
      const newComment = await createPostComment(
        selectedPost.id,
        commentText.trim()
      );
      setComments((prev) => [...prev, newComment]);
      setCommentText("");
      setPosts((prev) =>
        prev.map((p) =>
          p.id === selectedPost.id
            ? { ...p, comments_count: p.comments_count + 1 }
            : p
        )
      );
      setSelectedPost((current) =>
        current
          ? { ...current, comments_count: current.comments_count + 1 }
          : current
      );
    } catch (err) {
      Alert.alert("Could not post comment", toApiError(err).message);
    } finally {
      setSubmittingComment(false);
    }
  };

  const renderPost = ({ item }: { item: CommunityPost }) => {
    const imageUri = postPreviewImage(item, token);
    const urgent = isUrgentPost(item);
    const rail = postRail(item);
    const avatarUri = resolveFileUrl(item.author_avatar, token);

    return (
      <Pressable onPress={() => void handlePostPress(item)} style={styles.postCard}>
        <LinearGradient
          colors={[...rail]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={styles.postRail}
        />
        <View style={styles.postBody}>
          {imageUri ? (
            <Image source={{ uri: imageUri }} style={styles.postImage} />
          ) : null}
          <View style={styles.postInner}>
            <View style={styles.postHeader}>
              {avatarUri ? (
                <Image source={{ uri: avatarUri }} style={styles.avatar} />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Text style={styles.avatarText}>
                    {(item.author_name || "U")[0].toUpperCase()}
                  </Text>
                </View>
              )}
              <View style={styles.postAuthorInfo}>
                <Text style={styles.postAuthor} numberOfLines={1}>
                  {item.author_name || "Unknown"}
                </Text>
                <Text style={styles.postDate}>
                  {formatRelativeTime(item.created_at)}
                </Text>
              </View>
              {item.is_unread ? (
                <View style={[styles.statusChip, styles.statusChipUnread]}>
                  <Text style={styles.statusChipUnreadText}>New</Text>
                </View>
              ) : null}
              {urgent ? (
                <View style={[styles.statusChip, styles.statusChipUrgent]}>
                  <Text style={styles.statusChipUrgentText}>Urgent</Text>
                </View>
              ) : null}
            </View>

            <Text style={styles.postTitle}>{item.title}</Text>
            <Text style={styles.postContent} numberOfLines={3}>
              {stripHtmlToPlain(item.content)}
            </Text>

            {item.tags && item.tags.length > 0 ? (
              <View style={styles.tagsRow}>
                {item.tags.slice(0, 3).map((tag) => (
                  <View
                    key={tag}
                    style={[
                      styles.tag,
                      tag === "Urgent" && styles.tagUrgent,
                      tag === "Required" && styles.tagRequired
                    ]}
                  >
                    <Text
                      style={[
                        styles.tagText,
                        (tag === "Urgent" || tag === "Required") &&
                          styles.tagTextStrong
                      ]}
                    >
                      {tag}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}

            {item.requires_read_confirmation ? (
              <View
                style={[
                  styles.confirmHint,
                  item.user_has_confirmed
                    ? styles.confirmHintDone
                    : styles.confirmHintPending
                ]}
              >
                <Ionicons
                  name={
                    item.user_has_confirmed
                      ? "checkmark-circle-outline"
                      : "alert-circle-outline"
                  }
                  size={14}
                  color={item.user_has_confirmed ? "#15803d" : colors.primary}
                />
                <Text
                  style={[
                    styles.confirmHintText,
                    item.user_has_confirmed
                      ? styles.confirmHintTextDone
                      : styles.confirmHintTextPending
                  ]}
                >
                  {item.user_has_confirmed
                    ? "Read confirmed"
                    : "Confirmation required"}
                </Text>
              </View>
            ) : null}

            <View style={styles.postFooter}>
              <Pressable
                style={styles.footerButton}
                onPress={(event) => {
                  event.stopPropagation();
                  void handleLike(item);
                }}
                hitSlop={8}
              >
                <Ionicons
                  name={item.user_has_liked ? "heart" : "heart-outline"}
                  size={16}
                  color={item.user_has_liked ? colors.primary : colors.textMuted}
                />
                <Text
                  style={[
                    styles.footerText,
                    item.user_has_liked && styles.footerTextLiked
                  ]}
                >
                  {item.likes_count}
                </Text>
              </Pressable>
              <View style={styles.footerButton}>
                <Ionicons
                  name="chatbubble-outline"
                  size={15}
                  color={colors.textMuted}
                />
                <Text style={styles.footerText}>{item.comments_count}</Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={16}
                color={colors.textMuted}
                style={styles.footerChevron}
              />
            </View>
          </View>
        </View>
      </Pressable>
    );
  };

  return (
    <ScreenLayout scroll={false} style={styles.screen} contentStyle={styles.layout}>
      <Image
        source={GLOBE_BG}
        style={styles.globeBg}
        resizeMode="contain"
        tintColor={colors.textMuted}
        pointerEvents="none"
      />

      <View style={styles.topHeader}>
        <Pressable style={styles.headerIconBtn} onPress={openMenu} hitSlop={8}>
          <Ionicons name="menu" size={22} color={colors.textPrimary} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={styles.headerTitle}>Community</Text>
          <Text style={styles.headerSubtitle}>{communitySummary}</Text>
        </View>
        <Pressable
          style={styles.headerIconBtn}
          onPress={() => {
            void loadPosts();
          }}
          hitSlop={8}
        >
          <Ionicons name="refresh-outline" size={20} color={colors.textMuted} />
        </Pressable>
      </View>

      {loading && posts.length === 0 ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={ACCENT} />
          <Text style={styles.loadingText}>Loading posts…</Text>
        </View>
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(item) => item.id}
          style={styles.list}
          renderItem={renderPost}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              tintColor={ACCENT}
              onRefresh={() => {
                setRefreshing(true);
                void loadPosts().finally(() => setRefreshing(false));
              }}
            />
          }
          ListHeaderComponent={
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterRow}
            >
              {FILTERS.map((item) => {
                const active = filter === item.key;
                const count = item.key === "unread" ? unreadCount : null;
                return (
                  <Pressable
                    key={item.key}
                    onPress={() => setFilter(item.key)}
                    style={[
                      styles.filterChip,
                      active && styles.filterChipActive,
                      count === null && styles.filterChipPlain
                    ]}
                  >
                    <Text
                      style={[
                        styles.filterChipText,
                        active && styles.filterChipTextActive
                      ]}
                    >
                      {item.label}
                    </Text>
                    {count !== null ? (
                      <View
                        style={[
                          styles.filterCount,
                          active && styles.filterCountActive
                        ]}
                      >
                        <Text
                          style={[
                            styles.filterCountText,
                            active && styles.filterCountTextActive
                          ]}
                        >
                          {count}
                        </Text>
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          }
          ListEmptyComponent={
            !loading ? (
              <View style={styles.emptyWrap}>
                <View style={styles.emptyIcon}>
                  <Ionicons name="people-outline" size={28} color={ACCENT} />
                </View>
                <Text style={styles.emptyTitle}>No posts here</Text>
                <Text style={styles.emptyText}>
                  {filter === "unread"
                    ? "You're all caught up on community updates."
                    : "Nothing matches this filter yet."}
                </Text>
              </View>
            ) : null
          }
        />
      )}

      <Modal
        visible={selectedPost !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeDetail}
      >
        {selectedPost ? (
          <KeyboardAvoidingView
            style={styles.modalRoot}
            behavior={Platform.OS === "ios" ? "padding" : undefined}
          >
            <Image
              source={GLOBE_BG}
              style={styles.globeBg}
              resizeMode="contain"
              tintColor={colors.textMuted}
              pointerEvents="none"
            />
            <View
              style={[
                styles.modalHeader,
                { paddingTop: Math.max(insets.top, spacing.md) }
              ]}
            >
              <Pressable style={styles.headerIconBtn} onPress={closeDetail} hitSlop={8}>
                <Ionicons name="close" size={22} color={colors.textPrimary} />
              </Pressable>
              <Text style={styles.modalHeaderTitle} numberOfLines={1}>
                Post
              </Text>
              <View style={styles.headerIconBtn} />
            </View>

            <ScrollView
              style={styles.modalScroll}
              contentContainerStyle={styles.modalContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.detailPostCard}>
                {detailBannerUri ? (
                  <Image
                    source={{ uri: detailBannerUri }}
                    style={[
                      styles.detailBanner,
                      selectedPost.photo_url
                        ? {
                            objectPosition: `${selectedPost.banner_focal_x ?? 50}% ${selectedPost.banner_focal_y ?? 50}%`,
                          }
                        : null,
                    ]}
                    resizeMode="cover"
                  />
                ) : null}
                <View style={styles.detailInner}>
                  <View style={styles.postHeader}>
                    {resolveFileUrl(selectedPost.author_avatar, token) ? (
                      <Image
                        source={{
                          uri: resolveFileUrl(
                            selectedPost.author_avatar,
                            token
                          ) as string
                        }}
                        style={styles.avatar}
                      />
                    ) : (
                      <View style={styles.avatarPlaceholder}>
                        <Text style={styles.avatarText}>
                          {(selectedPost.author_name || "U")[0].toUpperCase()}
                        </Text>
                      </View>
                    )}
                    <View style={styles.postAuthorInfo}>
                      <Text style={styles.postAuthor}>
                        {selectedPost.author_name || "Unknown"}
                      </Text>
                      <Text style={styles.postDate}>
                        {formatRelativeTime(selectedPost.created_at)}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.detailTitle}>{selectedPost.title}</Text>
                  {detailBodyText ? (
                    <Text style={styles.detailBody}>{detailBodyText}</Text>
                  ) : null}

                  {selectedPost.tags && selectedPost.tags.length > 0 ? (
                    <View style={styles.tagsRow}>
                      {selectedPost.tags.slice(0, 4).map((tag) => (
                        <View
                          key={tag}
                          style={[
                            styles.tag,
                            tag === "Urgent" && styles.tagUrgent,
                            tag === "Required" && styles.tagRequired
                          ]}
                        >
                          <Text
                            style={[
                              styles.tagText,
                              (tag === "Urgent" || tag === "Required") &&
                                styles.tagTextStrong
                            ]}
                          >
                            {tag}
                          </Text>
                        </View>
                      ))}
                    </View>
                  ) : null}

                  {detailAttachments.length > 0 ? (
                    <View style={styles.attachmentsBlock}>
                      {detailAttachments.map((att) => {
                        const uri = resolveFileUrl(att.url, token);
                        const image = isImageFile(att.name, att.url);
                        return (
                          <Pressable
                            key={att.key}
                            style={
                              image
                                ? styles.attachmentImageWrap
                                : styles.downloadBtn
                            }
                            onPress={() => {
                              if (uri) void Linking.openURL(uri);
                            }}
                          >
                            {image && uri ? (
                              <Image
                                source={{ uri }}
                                style={styles.attachmentImage}
                                resizeMode="cover"
                              />
                            ) : (
                              <>
                                <View style={styles.downloadIconWrap}>
                                  <Ionicons
                                    name="document-outline"
                                    size={18}
                                    color={ACCENT}
                                  />
                                </View>
                                <View style={styles.downloadCopy}>
                                  <Text
                                    style={styles.downloadBtnText}
                                    numberOfLines={1}
                                  >
                                    {att.name}
                                  </Text>
                                  <Text style={styles.downloadHint}>Download</Text>
                                </View>
                                <Ionicons
                                  name="download-outline"
                                  size={16}
                                  color={colors.textMuted}
                                />
                              </>
                            )}
                          </Pressable>
                        );
                      })}
                    </View>
                  ) : null}

                  <View style={styles.detailFooter}>
                    <Pressable
                      style={styles.footerButton}
                      onPress={() => void handleLike(selectedPost)}
                      hitSlop={8}
                    >
                      <Ionicons
                        name={
                          selectedPost.user_has_liked ? "heart" : "heart-outline"
                        }
                        size={18}
                        color={
                          selectedPost.user_has_liked
                            ? colors.primary
                            : colors.textMuted
                        }
                      />
                      <Text
                        style={[
                          styles.footerText,
                          selectedPost.user_has_liked && styles.footerTextLiked
                        ]}
                      >
                        {selectedPost.likes_count}
                      </Text>
                    </Pressable>
                    <View style={styles.footerButton}>
                      <Ionicons
                        name="chatbubble-outline"
                        size={16}
                        color={colors.textMuted}
                      />
                      <Text style={styles.footerText}>
                        {selectedPost.comments_count}
                      </Text>
                    </View>
                  </View>
                </View>
              </View>

              {selectedPost.requires_read_confirmation ? (
                <View style={styles.detailCard}>
                  {selectedPost.user_has_confirmed ? (
                    <View style={styles.confirmDoneRow}>
                      <Ionicons
                        name="checkmark-circle"
                        size={18}
                        color="#15803d"
                      />
                      <Text style={styles.confirmHintTextDone}>
                        Read confirmed
                      </Text>
                    </View>
                  ) : (
                    <>
                      <Text style={styles.confirmPrompt}>
                        This post requires you to confirm that you have read it.
                      </Text>
                      <Pressable
                        style={styles.primaryBtn}
                        onPress={() => void handleConfirmRead(selectedPost)}
                        disabled={confirmingRead}
                      >
                        {confirmingRead ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <Text style={styles.primaryBtnText}>
                            Confirm I have read this
                          </Text>
                        )}
                      </Pressable>
                    </>
                  )}
                </View>
              ) : null}

              <View style={styles.detailCard}>
                <Text style={styles.sectionLabel}>
                  Comments ({comments.length})
                </Text>
                {loadingComments ? (
                  <ActivityIndicator color={ACCENT} />
                ) : comments.length === 0 ? (
                  <Text style={styles.muted}>No comments yet.</Text>
                ) : (
                  comments.map((comment) => {
                    const commentAvatar = resolveFileUrl(
                      comment.user_avatar,
                      token
                    );
                    return (
                      <View key={comment.id} style={styles.comment}>
                        {commentAvatar ? (
                          <Image
                            source={{ uri: commentAvatar }}
                            style={styles.commentAvatar}
                          />
                        ) : (
                          <View style={styles.commentAvatarPlaceholder}>
                            <Text style={styles.commentAvatarText}>
                              {(comment.user_name || "U")[0].toUpperCase()}
                            </Text>
                          </View>
                        )}
                        <View style={styles.commentBody}>
                          <Text style={styles.commentAuthor}>
                            {comment.user_name || "Unknown"}
                          </Text>
                          <Text style={styles.commentContent}>
                            {comment.content}
                          </Text>
                          <Text style={styles.commentDate}>
                            {formatRelativeTime(comment.created_at)}
                          </Text>
                        </View>
                      </View>
                    );
                  })
                )}
              </View>
            </ScrollView>

            <View
              style={[
                styles.commentBar,
                { paddingBottom: Math.max(insets.bottom, spacing.md) }
              ]}
            >
              <TextInput
                style={styles.commentInput}
                value={commentText}
                onChangeText={setCommentText}
                placeholder="Write a comment…"
                placeholderTextColor={colors.textMuted}
                multiline
              />
              <Pressable
                style={[
                  styles.sendBtn,
                  !commentText.trim() && styles.sendBtnDisabled
                ]}
                onPress={() => void handleSubmitComment()}
                disabled={!commentText.trim() || submittingComment}
              >
                {submittingComment ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Ionicons name="send" size={16} color="#fff" />
                )}
              </Pressable>
            </View>
          </KeyboardAvoidingView>
        ) : null}
      </Modal>
    </ScreenLayout>
  );
};

const styles = StyleSheet.create({
  screen: { backgroundColor: "#fff" },
  layout: {
    flex: 1,
    backgroundColor: "transparent",
    paddingHorizontal: 16,
    paddingBottom: spacing.md,
    overflow: "hidden",
    position: "relative"
  },
  globeBg: {
    position: "absolute",
    width: 640,
    height: 640,
    right: -255,
    bottom: -40,
    opacity: 0.06
  },
  topHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginBottom: spacing.md,
    zIndex: 1
  },
  headerIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center"
  },
  headerCopy: { flex: 1, minWidth: 0 },
  headerTitle: {
    fontFamily: typography.button.fontFamily,
    fontSize: 18,
    lineHeight: 24,
    color: colors.textPrimary
  },
  headerSubtitle: {
    marginTop: 1,
    fontSize: 12,
    color: colors.textMuted
  },
  loadingWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1
  },
  loadingText: {
    marginTop: spacing.md,
    ...typography.bodySmall,
    color: colors.textMuted
  },
  list: { flex: 1, zIndex: 1 },
  listContent: { paddingBottom: spacing.xxl, flexGrow: 1, gap: spacing.md },
  filterRow: { gap: spacing.sm, paddingRight: spacing.sm, marginBottom: spacing.sm },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#fff",
    paddingLeft: 12,
    paddingRight: 6,
    paddingVertical: 7
  },
  filterChipActive: {
    backgroundColor: ACCENT,
    borderColor: ACCENT
  },
  filterChipPlain: { paddingRight: 12 },
  filterChipText: {
    fontFamily: typography.button.fontFamily,
    fontSize: 12,
    color: colors.textBody
  },
  filterChipTextActive: { color: "#fff" },
  filterCount: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6
  },
  filterCountActive: { backgroundColor: "rgba(255,255,255,0.22)" },
  filterCountText: {
    fontFamily: typography.button.fontFamily,
    fontSize: 11,
    color: colors.textMuted
  },
  filterCountTextActive: { color: "#fff" },
  postCard: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderRadius: 16,
    overflow: "hidden",
    ...shadows.card
  },
  postRail: { width: RAIL_WIDTH, alignSelf: "stretch" },
  postBody: { flex: 1 },
  postImage: {
    width: "100%",
    height: 160,
    backgroundColor: colors.iconMutedBg
  },
  postInner: { padding: 14, gap: 8 },
  postHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  avatar: { width: 36, height: 36, borderRadius: 18 },
  avatarPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#DCFCE7",
    alignItems: "center",
    justifyContent: "center"
  },
  avatarText: {
    color: ACCENT,
    fontFamily: typography.button.fontFamily,
    fontSize: 13
  },
  postAuthorInfo: { flex: 1, minWidth: 0 },
  postAuthor: {
    fontFamily: typography.button.fontFamily,
    fontSize: 13,
    color: colors.textPrimary
  },
  postDate: { fontSize: 11, color: colors.textMuted, marginTop: 1 },
  statusChip: {
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 4
  },
  statusChipUnread: { backgroundColor: "#FEE2E2" },
  statusChipUnreadText: {
    fontFamily: typography.button.fontFamily,
    fontSize: 11,
    color: colors.primary
  },
  statusChipUrgent: { backgroundColor: "#FEF3C7" },
  statusChipUrgentText: {
    fontFamily: typography.button.fontFamily,
    fontSize: 11,
    color: "#B45309"
  },
  postTitle: {
    fontFamily: typography.button.fontFamily,
    fontSize: 16,
    lineHeight: 22,
    color: colors.textPrimary
  },
  postContent: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.textMuted
  },
  tagsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  tag: {
    borderRadius: radius.pill,
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 8,
    paddingVertical: 4
  },
  tagUrgent: { backgroundColor: "#FEE2E2" },
  tagRequired: { backgroundColor: "#FEF3C7" },
  tagText: {
    fontFamily: typography.button.fontFamily,
    fontSize: 11,
    color: colors.textMuted
  },
  tagTextStrong: { color: colors.textPrimary },
  confirmHint: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 4
  },
  confirmHintPending: {
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA"
  },
  confirmHintDone: {
    backgroundColor: "#ECFDF5",
    borderWidth: 1,
    borderColor: "#BBF7D0"
  },
  confirmHintText: {
    fontFamily: typography.button.fontFamily,
    fontSize: 11
  },
  confirmHintTextPending: { color: colors.primary },
  confirmHintTextDone: { color: "#15803d" },
  postFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginTop: 4
  },
  footerButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4
  },
  footerText: { fontSize: 13, color: colors.textMuted },
  footerTextLiked: {
    color: colors.primary,
    fontFamily: typography.button.fontFamily
  },
  footerChevron: { marginLeft: "auto" },
  emptyWrap: {
    alignItems: "center",
    paddingVertical: spacing.xxl,
    gap: spacing.sm
  },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: "#ECFDF3",
    alignItems: "center",
    justifyContent: "center"
  },
  emptyTitle: {
    fontFamily: typography.button.fontFamily,
    fontSize: 16,
    color: colors.textPrimary
  },
  emptyText: {
    ...typography.bodySmall,
    color: colors.textMuted,
    textAlign: "center"
  },
  modalRoot: {
    flex: 1,
    backgroundColor: colors.background
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: 16,
    paddingBottom: spacing.md,
    zIndex: 1
  },
  modalHeaderTitle: {
    flex: 1,
    textAlign: "center",
    fontFamily: typography.button.fontFamily,
    fontSize: 18,
    lineHeight: 24,
    color: colors.textPrimary
  },
  modalScroll: { flex: 1, zIndex: 1 },
  modalContent: {
    paddingHorizontal: 16,
    paddingBottom: spacing.xl,
    gap: spacing.md
  },
  detailPostCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    overflow: "hidden",
    ...shadows.card
  },
  detailBanner: {
    width: "100%",
    aspectRatio: 10 / 3,
    backgroundColor: colors.iconMutedBg
  },
  detailInner: {
    padding: 16,
    gap: 12
  },
  detailCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    gap: 10,
    ...shadows.card
  },
  detailTitle: {
    fontFamily: typography.button.fontFamily,
    fontSize: 22,
    lineHeight: 28,
    color: colors.textPrimary
  },
  detailBody: {
    fontSize: 15,
    lineHeight: 24,
    color: colors.textBody
  },
  attachmentsBlock: {
    gap: 10
  },
  attachmentImageWrap: {
    overflow: "hidden",
    borderRadius: 12,
    backgroundColor: colors.iconMutedBg
  },
  attachmentImage: {
    width: "100%",
    height: 200
  },
  downloadBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#F8FAFC",
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  downloadIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center"
  },
  downloadCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2
  },
  downloadBtnText: {
    fontFamily: typography.button.fontFamily,
    fontSize: 13,
    color: colors.textPrimary
  },
  downloadHint: {
    fontSize: 12,
    color: ACCENT
  },
  detailFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    paddingTop: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border
  },
  confirmPrompt: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.textBody
  },
  confirmDoneRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  primaryBtn: {
    height: 48,
    borderRadius: 14,
    backgroundColor: ACCENT,
    alignItems: "center",
    justifyContent: "center"
  },
  primaryBtnText: {
    fontFamily: typography.button.fontFamily,
    fontSize: 15,
    color: "#fff"
  },
  sectionLabel: {
    fontFamily: typography.button.fontFamily,
    fontSize: 12,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: colors.textMuted
  },
  muted: { fontSize: 14, color: colors.textMuted },
  comment: {
    flexDirection: "row",
    gap: 10,
    paddingVertical: 6
  },
  commentAvatar: { width: 32, height: 32, borderRadius: 16 },
  commentAvatarPlaceholder: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#DCFCE7",
    alignItems: "center",
    justifyContent: "center"
  },
  commentAvatarText: {
    color: ACCENT,
    fontFamily: typography.button.fontFamily,
    fontSize: 11
  },
  commentBody: { flex: 1, gap: 2 },
  commentAuthor: {
    fontFamily: typography.button.fontFamily,
    fontSize: 13,
    color: colors.textPrimary
  },
  commentContent: { fontSize: 14, lineHeight: 20, color: colors.textBody },
  commentDate: { fontSize: 11, color: colors.textMuted },
  commentBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: spacing.md,
    backgroundColor: "#fff",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    zIndex: 1
  },
  commentInput: {
    flex: 1,
    minHeight: 44,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.textPrimary
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: ACCENT,
    alignItems: "center",
    justifyContent: "center"
  },
  sendBtnDisabled: { opacity: 0.45 }
});
