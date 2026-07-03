import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import * as Location from "expo-location";
import { File, Paths } from "expo-file-system";
import { buildAuthenticatedFileUrl } from "../lib/fileUrls";
import { getStr } from "../lib/safetyFormPayload";
import type { SignatureRolePolicy } from "../lib/safetyFormTemplate";
import { uploadSafetyFormFile } from "../services/safetyUpload";
import { MKButton } from "./MKButton";
import { colors } from "../theme/colors";
import { spacing } from "../theme/spacing";
import { radius } from "../theme/radius";
import { typography } from "../theme/typography";

const SIGNATURE_HTML = `<!DOCTYPE html>
<html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"/>
<style>
*{box-sizing:border-box}body{margin:0;font-family:sans-serif;background:#fff}
#wrap{padding:8px}canvas{display:block;width:100%;height:180px;border:2px solid #ddd;border-radius:12px;touch-action:none}
.row{display:flex;gap:8px;margin-top:8px}
button{flex:1;padding:12px;border:0;border-radius:10px;font-size:14px;font-weight:600}
.clear{background:#f3f4f6;color:#374151}.save{background:#c0392b;color:#fff}
</style></head><body><div id="wrap">
<canvas id="c"></canvas>
<div class="row"><button class="clear" onclick="clearPad()">Clear</button><button class="save" onclick="savePad()">Save signature</button></div>
</div>
<script>
const canvas=document.getElementById('c');const ctx=canvas.getContext('2d');
let drawing=false,last={x:0,y:0},hasInk=false;
function resize(){const r=canvas.getBoundingClientRect();canvas.width=r.width*2;canvas.height=r.height*2;ctx.setTransform(2,0,0,2,0,0);ctx.lineWidth=2;ctx.lineCap='round';ctx.strokeStyle='#111';ctx.fillStyle='#fff';ctx.fillRect(0,0,r.width,r.height);}
resize();window.addEventListener('resize',resize);
function pos(e){const r=canvas.getBoundingClientRect();const t=e.touches?e.touches[0]:e;return{x:t.clientX-r.left,y:t.clientY-r.top};}
function start(e){drawing=true;last=pos(e);e.preventDefault();}
function move(e){if(!drawing)return;const p=pos(e);ctx.beginPath();ctx.moveTo(last.x,last.y);ctx.lineTo(p.x,p.y);ctx.stroke();last=p;hasInk=true;e.preventDefault();}
function end(){drawing=false;}
canvas.addEventListener('mousedown',start);canvas.addEventListener('mousemove',move);canvas.addEventListener('mouseup',end);canvas.addEventListener('mouseleave',end);
canvas.addEventListener('touchstart',start,{passive:false});canvas.addEventListener('touchmove',move,{passive:false});canvas.addEventListener('touchend',end);
function clearPad(){resize();hasInk=false;}
function savePad(){if(!hasInk){window.ReactNativeWebView.postMessage(JSON.stringify({type:'error',message:'Draw your signature first'}));return;}
window.ReactNativeWebView.postMessage(JSON.stringify({type:'save',data:canvas.toDataURL('image/png')}));}
</script></body></html>`;

interface MKSafetySignatureBlockProps {
  policy?: SignatureRolePolicy;
  payload: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
  projectId: string;
  inspectionId?: string;
  token?: string | null;
  signerDisplayName?: string;
  signerUserId?: string;
  readOnly?: boolean;
}


export const MKSafetySignatureBlock: React.FC<MKSafetySignatureBlockProps> = ({
  policy,
  payload,
  onChange,
  projectId,
  inspectionId,
  token,
  signerDisplayName = "",
  signerUserId,
  readOnly = false
}) => {
  const webRef = useRef<WebView>(null);
  const [uploading, setUploading] = useState(false);
  const mode = policy?.mode || "drawn";
  const fileId = getStr(payload, "_worker_signature_file_id") || null;
  const showTyped = mode === "typed" || mode === "any";
  const showDrawn = mode === "drawn" || mode === "any";

  const clearSignature = () => {
    const next = { ...payload };
    delete next._worker_signature_file_id;
    delete next._worker_signature_signed_at;
    delete next._worker_signature_signer_name;
    delete next._worker_signature_signer_user_id;
    delete next._worker_signature_lat;
    delete next._worker_signature_lng;
    delete next._worker_signature_location_label;
    delete next._worker_signature;
    onChange(next);
  };

  const applySavedSignature = async (fileObjectId: string) => {
    let lat: number | undefined;
    let lng: number | undefined;
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === "granted") {
        const pos = await Location.getCurrentPositionAsync({});
        lat = pos.coords.latitude;
        lng = pos.coords.longitude;
      }
    } catch {
      // optional
    }
    onChange({
      ...payload,
      _worker_signature_file_id: fileObjectId,
      _worker_signature_signed_at: new Date().toISOString(),
      _worker_signature_signer_name: signerDisplayName,
      ...(signerUserId ? { _worker_signature_signer_user_id: signerUserId } : {}),
      ...(lat != null && lng != null ? { _worker_signature_lat: lat, _worker_signature_lng: lng } : {})
    });
  };

  const onWebMessage = async (event: WebViewMessageEvent) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data) as {
        type: string;
        data?: string;
        message?: string;
      };
      if (msg.type === "error") {
        Alert.alert("Signature", msg.message || "Could not save signature.");
        return;
      }
      if (msg.type !== "save" || !msg.data) return;
      setUploading(true);
      const file = new File(Paths.cache, `signature_${Date.now()}.png`);
      if (file.exists) file.delete();
      file.create({ overwrite: true });
      const response = await fetch(msg.data);
      const buffer = await response.arrayBuffer();
      file.write(new Uint8Array(buffer));
      const id = await uploadSafetyFormFile({
        projectId,
        inspectionId,
        file: { uri: file.uri, name: "signature.png", type: "image/png" }
      });
      await applySavedSignature(id);
      Alert.alert("Saved", "Signature saved.");
    } catch {
      Alert.alert("Upload failed", "Could not save signature.");
    } finally {
      setUploading(false);
    }
  };

  if (!policy) return null;

  return (
    <View style={styles.block}>
      <Text style={styles.title}>
        Worker signature{policy.required ? " *" : " (optional)"}
      </Text>

      {showTyped && !readOnly ? (
        <TextInput
          style={styles.input}
          value={getStr(payload, "_worker_signature")}
          onChangeText={(text) => onChange({ ...payload, _worker_signature: text })}
          placeholder="Type full name to sign"
          editable={!readOnly}
        />
      ) : null}

      {showDrawn ? (
        fileId ? (
          <View style={styles.savedWrap}>
            <Image
              source={{
                uri: buildAuthenticatedFileUrl(fileId, { token, variant: "inline" }).uri
              }}
              style={styles.savedImage}
              resizeMode="contain"
            />
            {!readOnly ? (
              <MKButton
                title="Replace signature"
                variant="secondary"
                size="compact"
                onPress={clearSignature}
              />
            ) : null}
          </View>
        ) : !readOnly ? (
          <View style={styles.padWrap}>
            <WebView
              ref={webRef}
              originWhitelist={["*"]}
              source={{ html: SIGNATURE_HTML }}
              onMessage={(e) => void onWebMessage(e)}
              style={styles.webview}
              scrollEnabled={false}
            />
            {uploading ? (
              <View style={styles.uploadOverlay}>
                <ActivityIndicator color={colors.primary} />
              </View>
            ) : null}
          </View>
        ) : (
          <Text style={styles.muted}>No signature on file.</Text>
        )
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  block: { gap: spacing.md },
  title: { ...typography.subtitle },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    ...typography.body
  },
  padWrap: { height: 240, borderRadius: radius.card, overflow: "hidden" },
  webview: { flex: 1, backgroundColor: colors.card },
  uploadOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255,255,255,0.6)",
    alignItems: "center",
    justifyContent: "center"
  },
  savedWrap: { gap: spacing.sm },
  savedImage: {
    width: "100%",
    height: 120,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    backgroundColor: colors.card
  },
  muted: { ...typography.bodySmall, color: colors.textMuted }
});
