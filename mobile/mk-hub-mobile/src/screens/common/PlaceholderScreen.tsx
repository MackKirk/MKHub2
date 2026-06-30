import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useRoute, type RouteProp } from "@react-navigation/native";
import { ScreenLayout } from "../../components/ScreenLayout";
import { MKPageHeader } from "../../components/MKPageHeader";
import type { RootStackParamList } from "../../navigation/types";
import { colors } from "../../theme/colors";
import { typography } from "../../theme/typography";
import { spacing } from "../../theme/spacing";

type PlaceholderRoute = RouteProp<RootStackParamList, "Placeholder">;

export const PlaceholderScreen: React.FC = () => {
  const route = useRoute<PlaceholderRoute>();
  return (
    <ScreenLayout scroll={false}>
      <MKPageHeader title={route.params.title} />
      <View style={styles.box}>
        <Text style={styles.text}>
          {route.params.message ??
            "This section is available on the MK Hub web app."}
        </Text>
      </View>
    </ScreenLayout>
  );
};

const styles = StyleSheet.create({
  box: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl
  },
  text: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: "center"
  }
});
