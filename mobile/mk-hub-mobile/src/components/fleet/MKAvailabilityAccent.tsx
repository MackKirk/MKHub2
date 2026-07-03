import React from "react";
import { StyleSheet, View, ViewStyle } from "react-native";
import { fleetAvailabilityAccentColor } from "../../lib/fleetAssetUi";

interface MKAvailabilityAccentProps {
  isAssigned: boolean;
  style?: ViewStyle;
}

export const MKAvailabilityAccent: React.FC<MKAvailabilityAccentProps> = ({
  isAssigned,
  style
}) => {
  return (
    <View
      style={[styles.accent, { backgroundColor: fleetAvailabilityAccentColor(isAssigned) }, style]}
    />
  );
};

const styles = StyleSheet.create({
  accent: {
    width: 4,
    alignSelf: "stretch"
  }
});
