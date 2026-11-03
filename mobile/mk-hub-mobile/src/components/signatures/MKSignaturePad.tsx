import React, { useRef, useState } from "react";
import {
  Alert,
  Image,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { MKButton } from "../MKButton";
import { colors } from "../../theme/colors";
import { radius } from "../../theme/radius";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

const SIGNATURE_HTML = `<!DOCTYPE html>
<html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"/>
<style>
*{box-sizing:border-box}body{margin:0;font-family:sans-serif;background:#fff}
#wrap{padding:8px}canvas{display:block;width:100%;height:140px;border:2px solid #ddd;border-radius:12px;touch-action:none;background:#fff}
.row{display:flex;gap:8px;margin-top:8px}
button{flex:1;padding:12px;border:0;border-radius:10px;font-size:14px;font-weight:600}
.clear{background:#f3f4f6;color:#374151}.save{background:#147D36;color:#fff}
</style></head><body><div id="wrap">
<canvas id="c"></canvas>
<div class="row"><button class="clear" onclick="clearPad()">Clear</button><button class="save" onclick="savePad()">Save</button></div>
</div>
<script>
const canvas=document.getElementById('c');const ctx=canvas.getContext('2d');
let drawing=false,last={x:0,y:0},hasInk=false;
function cssSize(){const r=canvas.getBoundingClientRect();return{w:r.width,h:r.height};}
function resize(){const s=cssSize();canvas.width=s.w*2;canvas.height=s.h*2;ctx.setTransform(2,0,0,2,0,0);ctx.lineWidth=2;ctx.lineCap='round';ctx.strokeStyle='#111';ctx.fillStyle='#fff';ctx.fillRect(0,0,s.w,s.h);hasInk=false;}
resize();window.addEventListener('resize',resize);
function pos(e){const r=canvas.getBoundingClientRect();const t=e.touches?e.touches[0]:e;return{x:t.clientX-r.left,y:t.clientY-r.top};}
function start(e){drawing=true;last=pos(e);e.preventDefault();}
function move(e){if(!drawing)return;const p=pos(e);ctx.beginPath();ctx.moveTo(last.x,last.y);ctx.lineTo(p.x,p.y);ctx.stroke();last=p;hasInk=true;e.preventDefault();}
function end(){drawing=false;}
canvas.addEventListener('mousedown',start);canvas.addEventListener('mousemove',move);canvas.addEventListener('mouseup',end);canvas.addEventListener('mouseleave',end);
canvas.addEventListener('touchstart',start,{passive:false});canvas.addEventListener('touchmove',move,{passive:false});canvas.addEventListener('touchend',end);
function clearPad(){resize();}
function savePad(){if(!hasInk){window.ReactNativeWebView.postMessage(JSON.stringify({type:'error',message:'Draw your signature first'}));return;}
window.ReactNativeWebView.postMessage(JSON.stringify({type:'save',data:canvas.toDataURL('image/png')}));}
function paintTyped(name){
  resize();
  var s=cssSize();
  var t=String(name||'').trim();
  if(!t){window.ReactNativeWebView.postMessage(JSON.stringify({type:'error',message:'Type your full name first'}));return;}
  var size=Math.min(40,Math.floor(s.h*0.55));
  ctx.fillStyle='#111827';
  ctx.textAlign='center';
  ctx.textBaseline='middle';
  ctx.font=size+'px "Segoe Script","Brush Script MT","Apple Chancery",cursive';
  while(ctx.measureText(t).width>s.w*0.88 && size>14){size-=2;ctx.font=size+'px "Segoe Script","Brush Script MT","Apple Chancery",cursive';}
  ctx.fillText(t,s.w/2,s.h/2);
  hasInk=true;
  window.ReactNativeWebView.postMessage(JSON.stringify({type:'save',data:canvas.toDataURL('image/png')}));
}
</script></body></html>`;

interface MKSignaturePadProps {
  label?: string;
  value?: string | null;
  onChange: (dataUrl: string | null) => void;
  allowType?: boolean;
}

export const MKSignaturePad: React.FC<MKSignaturePadProps> = ({
  label = "Signature",
  value,
  onChange,
  allowType = true
}) => {
  const webRef = useRef<WebView>(null);
  const [mode, setMode] = useState<"draw" | "type">("draw");
  const [typed, setTyped] = useState("");

  const onWebMessage = (event: WebViewMessageEvent) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data) as {
        type: string;
        data?: string;
        message?: string;
      };
      if (msg.type === "error") {
        Alert.alert("Signature", msg.message || "Draw your signature first.");
        return;
      }
      if (msg.type === "save" && msg.data) {
        onChange(msg.data);
      }
    } catch {
      Alert.alert("Signature", "Could not capture signature.");
    }
  };

  const applyTyped = () => {
    const name = typed.trim();
    if (!name) {
      Alert.alert("Signature", "Type your full name first.");
      return;
    }
    webRef.current?.injectJavaScript(
      `paintTyped(${JSON.stringify(name)}); true;`
    );
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      {value ? (
        <View style={styles.saved}>
          <Image source={{ uri: value }} style={styles.preview} resizeMode="contain" />
          <MKButton
            title="Replace"
            variant="secondary"
            size="compact"
            onPress={() => onChange(null)}
          />
        </View>
      ) : (
        <>
          {allowType ? (
            <View style={styles.modeRow}>
              <MKButton
                title="Draw"
                size="compact"
                variant={mode === "draw" ? "primary" : "secondary"}
                onPress={() => setMode("draw")}
              />
              <MKButton
                title="Type"
                size="compact"
                variant={mode === "type" ? "primary" : "secondary"}
                onPress={() => setMode("type")}
              />
            </View>
          ) : null}
          {mode === "type" ? (
            <View style={styles.typeWrap}>
              <TextInput
                style={styles.input}
                value={typed}
                onChangeText={setTyped}
                placeholder="Type full name"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="words"
              />
              <MKButton title="Use typed name" onPress={applyTyped} />
            </View>
          ) : null}
          <View style={[styles.padWrap, mode === "type" && styles.padHidden]}>
            <WebView
              ref={webRef}
              originWhitelist={["*"]}
              source={{ html: SIGNATURE_HTML }}
              onMessage={onWebMessage}
              style={styles.webview}
              scrollEnabled={false}
            />
          </View>
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.sm
  },
  label: {
    ...typography.caption,
    color: colors.textMuted,
    textTransform: "uppercase"
  },
  modeRow: {
    flexDirection: "row",
    gap: spacing.sm
  },
  padWrap: {
    height: 220,
    borderRadius: radius.card,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card
  },
  padHidden: {
    height: 1,
    opacity: 0,
    overflow: "hidden"
  },
  webview: {
    flex: 1,
    backgroundColor: "transparent"
  },
  typeWrap: {
    gap: spacing.sm
  },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.control,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    ...typography.body,
    color: colors.textPrimary
  },
  saved: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card
  },
  preview: {
    width: "100%",
    height: 88,
    backgroundColor: "#fff"
  }
});
