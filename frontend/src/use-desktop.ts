import { Platform, useWindowDimensions } from "react-native";

export const DESKTOP_MIN_WIDTH = 1024;

/** True when running in a browser wide enough for a desktop layout. */
export function useIsDesktop(min: number = DESKTOP_MIN_WIDTH): boolean {
  const { width } = useWindowDimensions();
  return Platform.OS === "web" && width >= min;
}
