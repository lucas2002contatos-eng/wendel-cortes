import { ReactNode, useEffect } from "react";
import { Platform, StyleSheet, View, useWindowDimensions, Text } from "react-native";
import { colors, spacing } from "@/src/theme";

const FRAME_MAX_WIDTH = 520;
const DESKTOP_BREAKPOINT = 768;

/**
 * On web desktop, centers the app in a fixed-width column so screens
 * designed for mobile don't stretch across the whole browser window.
 * On native (and narrow web) it is a pass-through.
 */
export function WebFrame({ children }: { children: ReactNode }) {
  const { width } = useWindowDimensions();
  const isDesktopWeb = Platform.OS === "web" && width >= DESKTOP_BREAKPOINT;

  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    document.title = "Wendel Cortes — Barbearia";
    document.body.style.backgroundColor = colors.surface;
  }, []);

  if (!isDesktopWeb) return <>{children}</>;

  return (
    <View style={styles.backdrop}>
      <View style={styles.sideBrand}>
        <Text style={styles.brandTop}>WENDEL</Text>
        <Text style={styles.brandBottom}>CORTES</Text>
        <View style={styles.brandLine} />
        <Text style={styles.brandSub}>Agendamentos · Fila · Cliente Mensal</Text>
      </View>
      <View style={styles.frame}>{children}</View>
      <View style={styles.sideSpacer} />
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: colors.surface,
    alignItems: "stretch",
    justifyContent: "center",
  },
  frame: {
    flex: 1,
    maxWidth: FRAME_MAX_WIDTH,
    width: "100%",
    backgroundColor: colors.surface,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  sideBrand: {
    flex: 1,
    justifyContent: "center",
    alignItems: "flex-end",
    paddingRight: spacing["3xl"],
  },
  sideSpacer: { flex: 1 },
  brandTop: { color: colors.onSurface, fontSize: 40, fontWeight: "300", letterSpacing: 8 },
  brandBottom: { color: colors.brandPrimary, fontSize: 40, fontWeight: "800", letterSpacing: 8 },
  brandLine: { height: 1, width: 72, backgroundColor: colors.brandPrimary, marginVertical: spacing.xl },
  brandSub: { color: colors.muted, fontSize: 13, letterSpacing: 1.5, textTransform: "uppercase" },
});
