import React from "react";

import { Image, StyleSheet, Text, View } from "react-native";

import { Ionicons } from "@expo/vector-icons";

import { MKCard } from "../MKCard";

import { MKBadge } from "../MKBadge";

import { MKAvailabilityAccent } from "./MKAvailabilityAccent";

import {

  buildFleetAssetSubtitle,

  buildFleetAssetTitle,

  formatFleetAssetStatus,

  formatFleetAssetType,

  getFleetAssetStatusVariant

} from "../../lib/fleetAssetUi";

import { resolveFileUrl } from "../../lib/fileUrls";

import type { AssetAssignment, FleetAsset } from "../../types/fleet";

import { colors } from "../../theme/colors";

import { spacing } from "../../theme/spacing";

import { typography } from "../../theme/typography";



interface MKFleetAssetHeroProps {

  asset: FleetAsset;

  openAssignment?: AssetAssignment | null;

  token?: string | null;

  variant?: "full" | "compact";

}



export const MKFleetAssetHero: React.FC<MKFleetAssetHeroProps> = ({

  asset,

  openAssignment,

  token,

  variant = "full"

}) => {

  const isCompact = variant === "compact";

  const isAssigned = Boolean(openAssignment);

  const photoId = asset.photos?.[0];

  const photoUri = photoId ? resolveFileUrl(`/files/${photoId}/thumbnail?w=640`, token ?? null) : null;

  const title = buildFleetAssetTitle(asset);

  const subtitle = buildFleetAssetSubtitle(asset);



  return (

    <MKCard style={styles.card} elevated>

      <View style={styles.cardRow}>

        <MKAvailabilityAccent isAssigned={isAssigned} />

        <View style={styles.cardBody}>

          {!isCompact ? (

            <View style={styles.coverWrap}>

              {photoUri ? (

                <Image source={{ uri: photoUri }} style={styles.cover} resizeMode="cover" />

              ) : (

                <View style={[styles.cover, styles.coverPlaceholder]}>

                  <Ionicons name="car-outline" size={36} color={colors.textMuted} />

                </View>

              )}

            </View>

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

    width: "100%"

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


