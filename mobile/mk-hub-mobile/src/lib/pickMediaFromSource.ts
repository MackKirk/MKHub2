import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { Alert } from "react-native";
import type { ImageSourceChoice } from "./MKImageSourcePickerModal";

export type PickedMediaFile = {
  uri: string;
  name: string;
  type: string;
};

export async function pickMediaFromSource(
  source: ImageSourceChoice,
  options?: { allowMultiple?: boolean }
): Promise<PickedMediaFile[]> {
  const allowMultiple = options?.allowMultiple ?? true;

  if (source === "camera") {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Camera permission is required.");
      return [];
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85
    });
    if (result.canceled || !result.assets[0]) return [];
    const asset = result.assets[0];
    return [
      {
        uri: asset.uri,
        name: asset.fileName ?? `photo_${Date.now()}.jpg`,
        type: asset.mimeType || "image/jpeg"
      }
    ];
  }

  if (source === "gallery") {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Photo library permission is required.");
      return [];
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: allowMultiple,
      quality: 0.85
    });
    if (result.canceled) return [];
    return result.assets.map((asset) => ({
      uri: asset.uri,
      name: asset.fileName ?? `photo_${Date.now()}.jpg`,
      type: asset.mimeType || "image/jpeg"
    }));
  }

  const result = await DocumentPicker.getDocumentAsync({
    type: "application/pdf",
    copyToCacheDirectory: true,
    multiple: allowMultiple
  });
  if (result.canceled) return [];
  return result.assets.map((asset) => ({
    uri: asset.uri,
    name: asset.name || `file_${Date.now()}.pdf`,
    type: asset.mimeType || "application/pdf"
  }));
}
