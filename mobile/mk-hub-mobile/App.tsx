import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { StatusBar, View, ActivityIndicator, StyleSheet } from "react-native";
import {
  useFonts,
  Montserrat_400Regular,
  Montserrat_700Bold
} from "@expo-google-fonts/montserrat";
import { AuthProvider } from "./src/hooks/useAuth";
import { RootNavigator } from "./src/navigation/RootNavigator";
import { colors } from "./src/theme/colors";

export default function App() {
  const [fontsLoaded] = useFonts({
    Montserrat_400Regular,
    Montserrat_700Bold
  });

  if (!fontsLoaded) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <AuthProvider>
      <NavigationContainer>
        <StatusBar barStyle="dark-content" />
        <RootNavigator />
      </NavigationContainer>
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.background
  }
});


