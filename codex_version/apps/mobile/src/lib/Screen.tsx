import { colors, spacing } from "@metrotrip/design-tokens";
import type { PropsWithChildren } from "react";
import { SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";

type ScreenProps = PropsWithChildren<{ eyebrow: string; title: string; description: string }>;

export function Screen({ eyebrow, title, description, children }: ScreenProps) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.eyebrow}>{eyebrow}</Text>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.description}>{description}</Text>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.canvas },
  content: { flexGrow: 1, padding: spacing.lg, paddingTop: spacing.xl, paddingBottom: 120 },
  eyebrow: { color: colors.brand, fontSize: 12, fontWeight: "800", letterSpacing: 1.4 },
  title: { color: colors.ink, fontSize: 36, fontWeight: "800", marginTop: spacing.sm },
  description: { color: colors.muted, fontSize: 16, lineHeight: 25, marginTop: spacing.md },
});
