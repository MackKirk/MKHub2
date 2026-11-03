import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import { ScreenLayout } from "../../components/ScreenLayout";
import { MKPageHeader } from "../../components/MKPageHeader";
import { useHubMenu } from "../../navigation/HubMenuProvider";
import type { HomeStackParamList } from "../../navigation/types";
import { colors } from "../../theme/colors";
import { typography } from "../../theme/typography";
import { spacing } from "../../theme/spacing";

type PlaceholderRoute = RouteProp<HomeStackParamList, "Placeholder">;

export const PlaceholderScreen: React.FC = () => {
  const route = useRoute<PlaceholderRoute>();
  const navigation = useNavigation();
  const { openMenu } = useHubMenu();

  return (
    <ScreenLayout scroll={false}>
      <MKPageHeader
        title={route.params.title}
        onBack={() => navigation.goBack()}
        onMenu={openMenu}
      />
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
