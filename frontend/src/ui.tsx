import { View, Text, StyleSheet, ActivityIndicator, Pressable } from "react-native";
import { colors, spacing, radius } from "@/src/theme";
import Icon from "@react-native-vector-icons/feather";

export function Screen({ children, style }: any) {
  return <View style={[styles.screen, style]}>{children}</View>;
}

export function GoldButton({ label, onPress, disabled, testID, icon, style }: any) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      style={[styles.btn, disabled && { opacity: 0.5 }, style]}
    >
      {icon ? <Icon name={icon} size={18} color={colors.onBrandPrimary} style={{ marginRight: 8 }} /> : null}
      <Text style={styles.btnText}>{label}</Text>
    </Pressable>
  );
}

export function GhostButton({ label, onPress, testID, style }: any) {
  return (
    <Pressable testID={testID} onPress={onPress} style={[styles.ghost, style]}>
      <Text style={styles.ghostText}>{label}</Text>
    </Pressable>
  );
}

export function Card({ children, style }: any) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Loading() {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface }}>
      <ActivityIndicator size="large" color={colors.brandPrimary} />
    </View>
  );
}

export function Badge({ label, tone = "default" }: { label: string; tone?: "default" | "success" | "warning" | "error" | "info" | "gold" }) {
  const map: any = {
    default: { bg: colors.surfaceTertiary, fg: colors.onSurfaceTertiary },
    success: { bg: colors.success, fg: colors.onSuccess },
    warning: { bg: colors.warning, fg: colors.onWarning },
    error: { bg: colors.error, fg: colors.onError },
    info: { bg: colors.info, fg: colors.onInfo },
    gold: { bg: colors.brandTertiary, fg: colors.brandPrimary },
  };
  const c = map[tone];
  return (
    <View style={{ backgroundColor: c.bg, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, alignSelf: "flex-start" }}>
      <Text style={{ color: c.fg, fontSize: 11, fontWeight: "700", letterSpacing: 0.5 }}>{label.toUpperCase()}</Text>
    </View>
  );
}

export const STATUS_LABELS: Record<string, string> = {
  agendado: "AGENDADO",
  pagamento_pendente: "PAGAMENTO PENDENTE",
  pago: "PAGO",
  cliente_chegou: "CLIENTE CHEGOU",
  em_atendimento: "EM ATENDIMENTO",
  concluido: "CONCLUÍDO",
  cancelado: "CANCELADO",
  nao_compareceu: "NÃO COMPARECEU",
};

export function statusTone(s: string): any {
  if (s === "pago" || s === "concluido") return "success";
  if (s === "pagamento_pendente" || s === "cliente_chegou") return "warning";
  if (s === "cancelado" || s === "nao_compareceu") return "error";
  if (s === "em_atendimento") return "info";
  return "default";
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.brandPrimary,
    paddingVertical: 16,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.md,
    minHeight: 52,
  },
  btnText: { color: colors.onBrandPrimary, fontWeight: "800", fontSize: 15, letterSpacing: 0.5 },
  ghost: {
    borderWidth: 1,
    borderColor: colors.borderStrong,
    paddingVertical: 14,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.md,
    alignItems: "center",
  },
  ghostText: { color: colors.onSurface, fontWeight: "700", fontSize: 14 },
  card: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
});
