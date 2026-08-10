import type { components } from "@metrotrip/contracts";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Screen } from "@/lib/Screen";
import { apiFetch } from "@/lib/api";
import { loadPlans } from "@/lib/offline";

type Plan = components["schemas"]["PlanView"];

export default function PlanDetailScreen() {
  const router = useRouter();
  const { planId } = useLocalSearchParams<{ planId: string }>();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [mode, setMode] = useState("저장본 확인 중");

  useEffect(() => { void (async () => {
    const cached = await loadPlans<Plan>();
    setPlan(cached.items.find((item) => item.id === planId) ?? null);
    setMode("오프라인 저장본");
    try { setPlan(await apiFetch<Plan>(`/plans/${planId}`)); setMode("온라인 최신본"); } catch { setMode("오프라인 저장본"); }
  })(); }, [planId]);

  return <Screen eyebrow="TRIP DETAIL" title={plan?.title ?? "일정 상세"} description={`${mode} · metrotrip://plans/${planId}`}>
    <Pressable accessibilityRole="button" onPress={() => router.back()}><Text style={styles.back}>← 일정 목록</Text></Pressable>
    {!plan ? <View style={styles.empty}><Text>이 기기에 저장된 일정이 없습니다.</Text></View> : plan.days.map((day) => <View style={styles.day} key={day.id}><Text style={styles.dayTitle}>{day.dayDate} · {day.title ?? `${day.position + 1}일차`}</Text>{day.items.map((item) => <View style={styles.item} key={item.id}><Text style={styles.itemTitle}>{item.note ?? item.itemType}</Text><Text style={styles.meta}>{item.scheduledTime ?? "시간 미정"} · {item.durationMinutes ? `${item.durationMinutes}분` : "소요시간 미정"}</Text></View>)}</View>)}
  </Screen>;
}

const styles = StyleSheet.create({ back: { color: "#175cd3", fontWeight: "800", marginTop: 24 }, empty: { marginTop: 16, padding: 20, borderRadius: 14, backgroundColor: "white" }, day: { marginTop: 16, padding: 18, borderRadius: 16, backgroundColor: "white" }, dayTitle: { fontSize: 18, fontWeight: "800" }, item: { marginTop: 10, padding: 12, borderRadius: 11, backgroundColor: "#f2f4f7" }, itemTitle: { fontWeight: "800" }, meta: { color: "#667085", fontSize: 12, marginTop: 4 } });
