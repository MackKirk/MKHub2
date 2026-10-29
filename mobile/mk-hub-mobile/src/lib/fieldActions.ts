import { Alert, Linking } from "react-native";

export function phoneToTel(phone?: string | null): string | null {
  const trimmed = String(phone || "").trim();
  if (!trimmed) return null;
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 7) return null;
  return `tel:${hasPlus ? "+" : ""}${digits}`;
}

export function emailToMailto(email?: string | null): string | null {
  const trimmed = String(email || "").trim();
  if (!trimmed.includes("@") || trimmed.includes(" ")) return null;
  return `mailto:${trimmed}`;
}

async function openUrl(url: string, failureTitle: string): Promise<void> {
  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert(failureTitle);
  }
}

export async function openPhone(phone?: string | null): Promise<void> {
  const url = phoneToTel(phone);
  if (!url) {
    Alert.alert("No phone number", "This contact has no number to call.");
    return;
  }
  await openUrl(url, "Could not start the call");
}

export async function openEmail(email?: string | null): Promise<void> {
  const url = emailToMailto(email);
  if (!url) {
    Alert.alert("No email", "This contact has no email address.");
    return;
  }
  await openUrl(url, "Could not open email");
}

export async function openMaps(target: {
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
}): Promise<void> {
  const address = String(target.address || "").trim();
  const usableAddress = address && address !== "—" && address !== "-" ? address : "";
  const lat =
    typeof target.lat === "number" && Number.isFinite(target.lat) ? target.lat : null;
  const lng =
    typeof target.lng === "number" && Number.isFinite(target.lng) ? target.lng : null;

  let query = "";
  if (lat != null && lng != null) query = `${lat},${lng}`;
  else if (usableAddress) query = usableAddress;

  if (!query) {
    Alert.alert("No address", "This place has no address to open in Maps.");
    return;
  }

  const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  await openUrl(url, "Could not open Maps");
}
