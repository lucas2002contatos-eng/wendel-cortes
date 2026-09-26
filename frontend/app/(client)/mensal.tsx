import { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl, Pressable } from "react-native";
import { useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import Icon from "@react-native-vector-icons/feather";
import { colors, spacing, radius } from "@/src/theme";
import { api } from "@/src/api";
import { GoldButton, Card, Badge } from "@/src/ui";

const SUB_LABEL: any = { active: { l: "ATIVO", t: "success" }, pending_payment: { l: "PAGAMENTO PENDENTE", t: "warning" }, expired: { l: "EXPIRADO", t: "error" }, canceled: { l: "CANCELADO", t: "error" } };

export default function Mensal() {
  const insets = useSafeAreaInsets();
  const [sub, setSub] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showPay, setShowPay] = useState(false);
  const [method, setMethod] = useState("pix");

  const load = useCallback(async () => {
    try {
      const s = await api("/subscription/me");
      setSub(s);
    } catch {}
    finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const subscribe = async () => {
    setBusy(true); setErr(null);
    try { await api("/subscription", { method: "POST", body: JSON.stringify({ payment_method: method }) }); await load(); setShowPay(false); }
    catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  };

  if (loading) return <View style={{ flex: 1, backgroundColor: colors.surface, justifyContent: "center", alignItems: "center" }}><ActivityIndicator color={colors.brandPrimary} /></View>;

  const remaining = sub ? sub.cuts_total - sub.cuts_used : 0;
  const stat = sub ? SUB_LABEL[sub.status] || { l: sub.status.toUpperCase(), t: "default" } : null;
  const renewDate = sub ? new Date(sub.period_end).toLocaleDateString("pt-BR") : "";

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + spacing.lg, paddingBottom: spacing["3xl"], paddingHorizontal: spacing.xl }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brandPrimary} />}>
        <Text style={styles.h1}>Cliente Mensal</Text>
        <Text style={styles.sub}>Sua assinatura mensal WENDEL CORTES</Text>

        {sub ? (
          <>
            <View style={styles.hero}>
              <Image source="https://images.unsplash.com/photo-1647140655214-e4a2d914971f?crop=entropy&cs=srgb&fm=jpg&q=85&w=800" style={StyleSheet.absoluteFill as any} contentFit="cover" />
              <LinearGradient colors={["rgba(10,10,10,0.4)", "rgba(10,10,10,0.98)"]} style={StyleSheet.absoluteFill as any} />
              <View style={{ padding: spacing.xl, gap: spacing.md }}>
                <Badge label={stat.l} tone={stat.t as any} />
                <Text style={styles.plan}>Plano Cliente Mensal</Text>
                <View style={{ flexDirection: "row", alignItems: "baseline", gap: spacing.sm }}>
                  <Text style={styles.big}>{remaining}</Text>
                  <Text style={styles.small}>/ {sub.cuts_total} cortes disponíveis</Text>
                </View>
                <View style={styles.dots}>
                  {Array.from({ length: sub.cuts_total }).map((_, i) => (
                    <View key={i} style={[styles.dot, i < sub.cuts_used ? styles.dotUsed : styles.dotFree]} />
                  ))}
                </View>
                <Text style={styles.info}>Cortes utilizados: {sub.cuts_used} · Restantes: {remaining}</Text>
                <Text style={styles.info}>Renovação: {renewDate}</Text>
                <Text style={styles.info}>Valor: R$ {Number(sub.price).toFixed(2)}/mês</Text>
              </View>
            </View>

            {sub.usage_history?.length > 0 && (
              <>
                <Text style={styles.sec}>Histórico de uso</Text>
                {sub.usage_history.map((h: any, i: number) => (
                  <View key={i} style={styles.hist}>
                    <Icon name="check-circle" size={16} color={colors.brandPrimary} />
                    <Text style={styles.histTxt}>Corte utilizado em {new Date(h.at).toLocaleString("pt-BR")}</Text>
                  </View>
                ))}
              </>
            )}

            {sub.status !== "active" && (
              <GoldButton testID="renew-btn" label="Renovar assinatura" onPress={() => setShowPay(true)} style={{ marginTop: spacing.xl }} />
            )}
          </>
        ) : (
          <>
            <Card style={{ marginTop: spacing.xl, alignItems: "flex-start", gap: spacing.md }}>
              <Icon name="award" size={32} color={colors.brandPrimary} />
              <Text style={styles.plan}>Cliente Mensal</Text>
              <Text style={styles.desc}>Assine e tenha 4 cortes por mês com preço fixo.</Text>
              <Text style={styles.price}>R$ 89,90<Text style={styles.priceSm}> /mês</Text></Text>
              <View style={{ gap: 6, marginTop: spacing.md }}>
                {["4 cortes por mês", "Renovação automática", "Prioridade no atendimento"].map((b) => (
                  <View key={b} style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                    <Icon name="check" size={14} color={colors.brandPrimary} />
                    <Text style={{ color: colors.onSurface }}>{b}</Text>
                  </View>
                ))}
              </View>
            </Card>
            <GoldButton testID="subscribe-btn" label="Assinar agora" onPress={() => setShowPay(true)} style={{ marginTop: spacing.xl }} />
          </>
        )}

        {showPay && (
          <View style={{ marginTop: spacing.xl, gap: spacing.sm }}>
            <Text style={styles.sec}>Forma de pagamento</Text>
            {[{ k: "pix", l: "PIX", i: "zap" }, { k: "cartao", l: "Cartão", i: "credit-card" }, { k: "dinheiro", l: "Dinheiro (pagar no local)", i: "dollar-sign" }].map((p) => (
              <Pressable key={p.k} testID={`sub-pay-${p.k}`} onPress={() => setMethod(p.k)} style={[styles.payRow, method === p.k && { borderColor: colors.brandPrimary }]}>
                <Icon name={p.i as any} size={18} color={method === p.k ? colors.brandPrimary : colors.muted} />
                <Text style={[styles.payTxt, method === p.k && { color: colors.onSurface }]}>{p.l}</Text>
              </Pressable>
            ))}
            {err && <View style={{ backgroundColor: colors.error, padding: spacing.md, borderRadius: radius.sm }}><Text style={{ color: colors.onError }}>{err}</Text></View>}
            <GoldButton testID="confirm-subscribe" label={busy ? "Processando..." : "Confirmar assinatura"} onPress={subscribe} disabled={busy} />
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  h1: { color: colors.onSurface, fontSize: 28, fontWeight: "700" },
  sub: { color: colors.muted, marginTop: 4, marginBottom: spacing.xl },
  sec: { color: colors.muted, fontSize: 12, letterSpacing: 1.5, textTransform: "uppercase", marginTop: spacing.xl, marginBottom: spacing.md },
  hero: { height: 340, borderRadius: radius.lg, overflow: "hidden", borderWidth: 1, borderColor: colors.brandPrimary, justifyContent: "flex-end" },
  plan: { color: colors.onSurface, fontSize: 22, fontWeight: "700" },
  desc: { color: colors.muted },
  price: { color: colors.brandPrimary, fontSize: 32, fontWeight: "800" },
  priceSm: { color: colors.muted, fontSize: 14, fontWeight: "500" },
  big: { color: colors.onSurface, fontSize: 60, fontWeight: "800", fontVariant: ["tabular-nums"] as any },
  small: { color: colors.muted, fontSize: 14 },
  dots: { flexDirection: "row", gap: 8 },
  dot: { width: 40, height: 6, borderRadius: 3 },
  dotFree: { backgroundColor: colors.brandPrimary },
  dotUsed: { backgroundColor: colors.surfaceTertiary },
  info: { color: colors.onSurfaceSecondary, fontSize: 13 },
  hist: { flexDirection: "row", gap: spacing.sm, alignItems: "center", padding: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, marginBottom: 6 },
  histTxt: { color: colors.onSurface, fontSize: 13 },
  payRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.lg, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md },
  payTxt: { color: colors.muted, fontWeight: "600" },
});
