import { useState } from "react";
import { View, Text, Pressable, Platform, StyleSheet } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";
import Icon from "@react-native-vector-icons/feather";
import { colors, spacing, radius } from "@/src/theme";
import { api, BACKEND_URL } from "@/src/api";

/** Resolve stored image paths (/api/public/images/..) to absolute URLs. */
export function imgUrl(u?: string | null) {
  if (!u) return "";
  return u.startsWith("/") ? `${BACKEND_URL}${u}` : u;
}

/** Pick an image from the gallery (phone or computer), upload it, and return its URL. Admin only. */
export function ImageField({ value, onChange, label, round = false, size = 84, testID }: { value?: string; onChange: (url: string) => void; label: string; round?: boolean; size?: number; testID?: string }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const pick = async () => {
    setErr(null);
    if (Platform.OS !== "web") {
      const perm = await ImagePicker.getMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        const req = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!req.granted) { setErr("Permita o acesso às fotos nas configurações do aparelho."); return; }
      }
    }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], base64: true, quality: 0.85, allowsEditing: !round ? false : true, aspect: round ? [1, 1] : undefined });
    if (res.canceled || !res.assets?.[0]) return;
    const a = res.assets[0];
    const type = a.mimeType || (a.uri.startsWith("data:") ? a.uri.slice(5, a.uri.indexOf(";")) : "image/jpeg");
    const base64 = a.base64 || (a.uri.startsWith("data:") ? a.uri.split(",")[1] : "");
    if (!base64) { setErr("Não foi possível ler a imagem"); return; }
    setBusy(true);
    try {
      const r = await api("/admin/images", { method: "POST", body: JSON.stringify({ data_base64: base64, content_type: type }) });
      onChange(r.url);
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  };

  return (
    <View style={{ marginTop: spacing.md }}>
      <Text style={styles.lbl}>{label}</Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, marginTop: 6 }}>
        <View style={[styles.box, { width: size, height: size, borderRadius: round ? size / 2 : radius.md }]}>
          {value ? <Image source={imgUrl(value)} style={{ width: "100%", height: "100%" }} contentFit="cover" /> : <Icon name="image" size={24} color={colors.muted} />}
        </View>
        <View style={{ flex: 1, gap: spacing.sm }}>
          <Pressable testID={testID || "image-pick-btn"} onPress={pick} disabled={busy} style={styles.btn}>
            <Icon name="upload" size={14} color={colors.onBrandPrimary} />
            <Text style={styles.btnTxt}>{busy ? "Enviando..." : value ? "Trocar imagem" : "Enviar da galeria"}</Text>
          </Pressable>
          {!!value && <Pressable testID="image-remove-btn" onPress={() => onChange("")} style={styles.btnGhost}><Text style={styles.btnGhostTxt}>Remover</Text></Pressable>}
        </View>
      </View>
      {err && <Text style={styles.err}>{err}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  lbl: { color: colors.muted, fontSize: 12 },
  box: { backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center", overflow: "hidden", borderWidth: 1, borderColor: colors.border },
  btn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.brandPrimary, paddingHorizontal: 12, paddingVertical: 10, borderRadius: radius.sm, alignSelf: "flex-start", minHeight: 40 },
  btnTxt: { color: colors.onBrandPrimary, fontWeight: "700", fontSize: 12 },
  btnGhost: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.borderStrong, alignSelf: "flex-start" },
  btnGhostTxt: { color: colors.onSurface, fontWeight: "600", fontSize: 12 },
  err: { color: colors.onError, fontSize: 12, marginTop: 6 },
});
