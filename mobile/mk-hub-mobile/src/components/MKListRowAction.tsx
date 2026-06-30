import React from "react";
import { StyleSheet, Text, TouchableOpacity } from "react-native";
import { colors } from "../theme/colors";
import { radius } from "../theme/radius";

interface MKListRowActionProps {
  icon: string;
  onPress: () => void;
  accessibilityLabel?: string;
}

export const MKListRowAction: React.FC<MKListRowActionProps> = ({
  icon,
  onPress
}) => {
  return (
    <TouchableOpacity
      style={styles.btn}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <Text style={styles.icon}>{icon}</Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  btn: {
    width: 32,
    height: 32,
    borderRadius: radius.control,
    backgroundColor: "#f3f4f6",
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center"
  },
  icon: {
    fontSize: 16
  }
});
