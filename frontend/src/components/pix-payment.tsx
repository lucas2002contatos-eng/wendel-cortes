import { useEffect, useState } from "react";
import { api } from "@/src/api";
import { View, Text, Pressable, StyleSheet, Platform } from "react-native";
import QRCode from "react-native-qrcode-svg";
import * as Clipboard from "expo-clipboard";
import Icon from "@react-native-vector-icons/feather";
import { colors, spacing, radius } from "@/src/theme";
import { GoldButton, GhostButton } from "@/src/ui";

const STATUS_LABEL: Record<string, string> = {
  aguardando_pagamento: "Aguardando pagamento", pago: "Pago", expirado: "Expirado", cancelado: "Cancelado", pendente_confirmacao: "Pendente de confirmação",
};

/** Valid PIX BR Code (EMV) rendered as QR + "Copia e Cola". */
export function PixPayment({ pix, apt, statusUrl, onDone }: { pix: any; apt: any; statusUrl?: string; onDone?: () => void }) {
  const [copied, setCopied] = useState(false);
  const [status, setStatus] = useState<string>(pix?.payment_status || "aguardando_pagamento");
  useEffect(() => {
    const url = statusUrl || (apt?.id ? `/appointments/${apt.id}/payment-status` : null);
    if (!url || status === "pago") return;
    const t = setInterval(async () => {
      try { const r = await api(url); if (r.payment_status) setStatus(r.payment_status); } catch {}
    }, 5000);
    return () => clearInterval(t);
  }, [statusUrl, apt?.id, status]);
  const copy = async () => {
    try {
      if (Platform.OS === "web" && typeof navigator !== "undefined" && navigator.clipboard) await navigator.clipboard.writeText(pix.payload);
      else await Clipboard.setStringAsync(pix.payload);
      setCopied(true); setTimeout(() => setCopied(false), 2500);
    } catch {}
  };

  if (!pix?.available) {
    return (
      <View style={styles.card}>
        <Icon name="alert-circle" size={28} color={colors.brandPrimary} />
        <Text style={styles.title}>PIX indisponível</Text>
        <Text style={styles.sub}>{pix?.reason || "A barbearia ainda não configurou a chave PIX."} Você pode pagar presencialmente no dia.</Text>
        {onDone && <GoldButton label="Ver meus agendamentos" onPress={onDone} style={{ marginTop: spacing.lg, alignSelf: "stretch" }} />}
      </View>
    );
  }

  if (status === "pago") {
    return (
      <View style={styles.card} testID="pix-paid">
        <Icon name="check-circle" size={48} color={colors.brandPrimary} />
        <Text style={styles.title}>Pagamento confirmado!</Text>
        <Text style={styles.sub}>R$ {Number(pix.amount).toFixed(2)} · {apt?.service_name}{apt?.barber_name ? ` com ${apt.barber_name}` : ""}. {apt?.date ? "Seu horário está garantido." : "Sua assinatura está ativa."}</Text>
        {onDone && <GoldButton testID="pix-done-btn" label={apt?.date ? "Ver meus agendamentos" : "Ver minha assinatura"} onPress={onDone} style={{ marginTop: spacing.lg, alignSelf: "stretch" }} />}
      </View>
    );
  }

  return (
    <View style={styles.card} testID="pix-payment">
      <Text style={styles.kicker}>PAGAMENTO PIX</Text>
      <Text style={styles.amount}>R$ {Number(pix.amount).toFixed(2)}</Text>
      <Text style={styles.sub}>{apt?.service_name}{apt?.barber_name ? ` · ${apt.barber_name}` : ""}{apt?.date ? ` · ${apt.date.split("-").reverse().join("/")} ${apt.time}` : ""}</Text>
      <View style={styles.qrBox}>
        <QRCode value={pix.payload} size={220} backgroundColor="#FFFFFF" color="#000000" />
      </View>
      <Text style={styles.hint}>Abra o app do seu banco, escolha <Text style={{ fontWeight: "700", color: colors.onSurface }}>Pagar com PIX → Ler QR Code</Text> ou use o código abaixo.</Text>
      <Pressable testID="pix-copy-btn" onPress={copy} style={styles.copyBox}>
        <Text style={styles.code} numberOfLines={3}>{pix.payload}</Text>
        <View style={styles.copyBtn}>
          <Icon name={copied ? "check" : "copy"} size={16} color={colors.onBrandPrimary} />
          <Text style={styles.copyTxt}>{copied ? "Copiado!" : "Copiar código PIX"}</Text>
        </View>
      </Pressable>
      <View style={styles.meta}>
        <Text style={styles.metaTxt}>Favorecido: <Text style={{ color: colors.onSurface }}>{pix.holder_name}</Text></Text>
        <Text style={styles.metaTxt}>Chave ({pix.key_type}): <Text style={{ color: colors.onSurface }}>{pix.key}</Text></Text>
        <Text style={styles.metaTxt}>Status: <Text style={{ color: colors.brandPrimary }}>{STATUS_LABEL[status]}</Text> · válido por {pix.expires_min} min</Text>
      </View>
      <Text style={styles.hint}>Esta tela atualiza sozinha quando o pagamento for confirmado. Se a confirmação automática não estiver ativa, a barbearia confirma manualmente.</Text>
      {onDone && <GhostButton testID="pix-done-btn" label="Já paguei / Ver meus agendamentos" onPress={onDone} style={{ marginTop: spacing.lg, alignSelf: "stretch" }} />}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.xl, alignItems: "center", gap: spacing.sm, marginTop: spacing.lg },
  kicker: { color: colors.brandPrimary, fontSize: 11, letterSpacing: 3, fontWeight: "700" },
  amount: { color: colors.onSurface, fontSize: 34, fontWeight: "800" },
  title: { color: colors.onSurface, fontSize: 18, fontWeight: "700" },
  sub: { color: colors.muted, fontSize: 13, textAlign: "center" },
  qrBox: { backgroundColor: "#FFFFFF", padding: 12, borderRadius: radius.md, marginTop: spacing.md },
  hint: { color: colors.muted, fontSize: 12, textAlign: "center", lineHeight: 17, marginTop: spacing.sm },
  copyBox: { alignSelf: "stretch", backgroundColor: colors.surfaceTertiary, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.sm, gap: spacing.sm },
  code: { color: colors.onSurfaceSecondary, fontSize: 11, fontFamily: Platform.OS === "web" ? "monospace" : undefined },
  copyBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.brandPrimary, paddingVertical: 12, borderRadius: radius.sm, minHeight: 44 },
  copyTxt: { color: colors.onBrandPrimary, fontWeight: "800", fontSize: 13 },
  meta: { alignSelf: "stretch", marginTop: spacing.sm, gap: 2 },
  metaTxt: { color: colors.muted, fontSize: 12 },
});
