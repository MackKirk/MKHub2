import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { MKCard } from "../MKCard";
import { MKBadge } from "../MKBadge";
import { MKImageSourcePickerModal } from "../MKImageSourcePickerModal";
import { MKAvailabilityAccent } from "./MKAvailabilityAccent";
import {
  buildFleetAssetSubtitle,
  buildFleetAssetTitle,
  formatFleetAssetStatus,
  formatFleetAssetType,
  getFleetAssetStatusVariant
} from "../../lib/fleetAssetUi";
import { resolveFileUrl } from "../../lib/fileUrls";
import { pickMediaFromSource } from "../../lib/pickMediaFromSource";
import { toApiError } from "../../services/api";
import { updateFleetAsset, uploadFleetAssetPhoto } from "../../services/fleet";
import type { AssetAssignment, FleetAsset } from "../../types/fleet";
import { colors } from "../../theme/colors";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

interface MKFleetAssetHeroProps {
  asset: FleetAsset;
  openAssignment?: AssetAssignment | null;
  token?: string | null;
  variant?: "full" | "compact";
  canEditPhoto?: boolean;
  onPhotosUpdated?: (asset: FleetAsset) => void;
}

export const MKFleetAssetHero: React.FC<MKFleetAssetHeroProps> = ({
  asset,
  openAssignment,
  token,
  variant = "full",
  canEditPhoto = false,
  onPhotosUpdated
}) => {
  const isCompact = variant === "compact";
  const isAssigned = Boolean(openAssignment);
  const photoId = asset.photos?.[0];
  const photoUri = photoId ? resolveFileUrl(`/files/${photoId}/thumbnail?w=640`, token ?? null) : null;
  const title = buildFleetAssetTitle(asset);
  const subtitle = buildFleetAssetSubtitle(asset);
  const showPhotoControls = canEditPhoto && !isCompact;

  const [pickerOpen, setPickerOpen] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);

  const persistPhotos = async (photos: string[] | null) => {
    const updated = await updateFleetAsset(asset.id, {
      photos: photos && photos.length > 0 ? photos : null
    });
    onPhotosUpdated?.(updated);
  };

  const handlePick = async (source: "camera" | "gallery") => {
    const files = await pickMediaFromSource(source, { allowMultiple: false });
    const file = files[0];
    if (!file) return;

    try {
      setPhotoBusy(true);
      const newId = await uploadFleetAssetPhoto(file);
      const rest = (asset.photos || []).slice(1);
      await persistPhotos([newId, ...rest]);
    } catch (err) {
      Alert.alert("Could not update photo", toApiError(err).message);
    } finally {
      setPhotoBusy(false);
    }
  };

  const handleRemovePhoto = async () => {
    try {
      setPhotoBusy(true);
      const rest = (asset.photos || []).slice(1);
      await persistPhotos(rest.length > 0 ? rest : null);
    } catch (err) {
      Alert.alert("Could not remove photo", toApiError(err).message);
    } finally {
      setPhotoBusy(false);
    }
  };

  const openPhotoActions = () => {
    if (photoBusy || !showPhotoControls) return;
    if (!photoId) {
      setPickerOpen(true);
      return;
    }
    Alert.alert("Asset photo", undefined, [
      { text: "Change photo", onPress: () => setPickerOpen(true) },
      {
        text: "Remove photo",
        style: "destructive",
        onPress: () => {
          void handleRemovePhoto();
        }
      },
      { text: "Cancel", style: "cancel" }
    ]);
  };

  return (
    <MKCard style={styles.card} elevated>
      <View style={styles.cardRow}>
        <MKAvailabilityAccent isAssigned={isAssigned} />
        <View style={styles.cardBody}>
          {!isCompact ? (
            <TouchableOpacity
              style={styles.coverWrap}
              activeOpacity={showPhotoControls ? 0.85 : 1}
              onPress={showPhotoControls ? openPhotoActions : undefined}
              disabled={!showPhotoControls || photoBusy}
            >
              {photoUri ? (
                <Image source={{ uri: photoUri }} style={styles.cover} resizeMode="cover" />
              ) : (
                <View style={[styles.cover, styles.coverPlaceholder]}>
                  <Ionicons name="car-outline" size={36} color={colors.textMuted} />
                </View>
              )}
              {showPhotoControls ? (
                <View style={styles.photoOverlay}>
                  {photoBusy ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Ionicons
                        name={photoId ? "camera-outline" : "add-circle-outline"}
                        size={18}
                        color="#fff"
                      />
                      <Text style={styles.photoOverlayText}>
                        {photoId ? "Change" : "Add photo"}
                      </Text>
                    </>
                  )}
                </View>
              ) : null}
            </TouchableOpacity>
          ) : null}

          <View style={[styles.identity, isCompact && styles.identityCompact]}>
            <Text style={[styles.title, isCompact && styles.titleCompact]} numberOfLines={2}>
              {title}
            </Text>
            <Text style={styles.subtitle} numberOfLines={2}>
              {subtitle}
            </Text>
            <View style={styles.badgeRow}>
              <MKBadge variant="neutral">{formatFleetAssetType(asset.asset_type)}</MKBadge>
              <MKBadge variant={getFleetAssetStatusVariant(asset.status)}>
                {formatFleetAssetStatus(asset.status)}
              </MKBadge>
              {isAssigned ? (
                <MKBadge variant="danger">Checked out</MKBadge>
              ) : (
                <MKBadge variant="success">Available</MKBadge>
              )}
            </View>
          </View>
        </View>
      </View>

      <MKImageSourcePickerModal
        visible={pickerOpen}
        title={photoId ? "Change photo" : "Add photo"}
        mode="image"
        onClose={() => setPickerOpen(false)}
        onSelect={(source) => {
          if (source === "camera" || source === "gallery") {
            void handlePick(source);
          }
        }}
      />
    </MKCard>
  );
};

const styles = StyleSheet.create({
  card: {
    padding: 0,
    overflow: "hidden"
  },
  cardRow: {
    flexDirection: "row",
    alignItems: "stretch"
  },
  cardBody: {
    flex: 1,
    minWidth: 0
  },
  coverWrap: {
    width: "100%",
    position: "relative"
  },
  cover: {
    width: "100%",
    height: 160,
    backgroundColor: colors.background
  },
  coverPlaceholder: {
    alignItems: "center",
    justifyContent: "center"
  },
  photoOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    backgroundColor: "rgba(0,0,0,0.45)"
  },
  photoOverlayText: {
    ...typography.bodySmall,
    color: "#fff",
    fontFamily: typography.button.fontFamily
  },
  identity: {
    padding: spacing.md,
    gap: spacing.xs
  },
  identityCompact: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md
  },
  title: {
    ...typography.titleSmall,
    color: colors.textPrimary
  },
  titleCompact: {
    ...typography.body,
    fontFamily: typography.button.fontFamily
  },
  subtitle: {
    ...typography.bodySmall,
    color: colors.textMuted
  },
  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    marginTop: spacing.xs
  }
});
