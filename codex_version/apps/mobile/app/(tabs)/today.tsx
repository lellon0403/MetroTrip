import type { components } from "@metrotrip/contracts";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Screen } from "@/lib/Screen";
import { dateInSeoul } from "@/lib/date";
import { loadPlans, loadTripProgress, saveTripProgress, type TripProgress } from "@/lib/offline";

type Plan = components["schemas"]["PlanView"];
type Item = components["schemas"]["PlanItemView"];

function itemLabel(item: Item) {
  if (item.note) return item.note;
  if (item.itemType === "PLACE") return `장소 ${item.placeId?.slice(0, 8) ?? ""}`;
  if (item.itemType === "STATION") return `역 ${item.stationId?.slice(0, 8) ?? ""}`;
  if (item.itemType === "ROUTE") return "이동 경로";
  return "일정 항목";
}

export default function TodayScreen() {
  const [todayPlans, setTodayPlans] = useState<Plan[]>([]);
  const [progress, setProgress] = useState<TripProgress>({});
  const [cacheTime, setCacheTime] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [{ items, updatedAt }, savedProgress] = await Promise.all([loadPlans<Plan>(), loadTripProgress()]);
    const today = dateInSeoul();
    setTodayPlans(items.filter((plan) => plan.startDate <= today && plan.endDate >= today));
    setProgress(savedProgress);
    setCacheTime(updatedAt);
  }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  async function toggle(planId: string, itemId: string) {
    const current = progress[planId] ?? { completedItemIds: [], pendingMutations: [] };
    const completed = current.completedItemIds.includes(itemId);
    const next: TripProgress = { ...progress, [planId]: {
      completedItemIds: completed ? current.completedItemIds.filter((id) => id !== itemId) : [...current.completedItemIds, itemId],
      pendingMutations: [...current.pendingMutations, { type: completed ? "REOPEN" : "COMPLETE", itemId, occurredAt: new Date().toISOString() }],
    } };
    setProgress(next);
    await saveTripProgress(next);
  }

  const today = dateInSeoul();
  return <Screen eyebrow="ON THE GO" title="오늘의 여행" description="현재 항목과 다음 이동을 오프라인에서도 확인하고 완료 상태를 기기에 저장합니다.">
    <Text style={styles.cache}>{cacheTime ? `기준 ${new Date(cacheTime).toLocaleString("ko-KR")}` : "동기화된 계획 없음"}</Text>
    {todayPlans.length === 0 ? <View style={styles.empty}><Text style={styles.title}>오늘 일정이 없어요</Text><Text>일정 탭에서 온라인 상태일 때 계획을 동기화해 주세요.</Text></View> : todayPlans.map((plan) => {
      const day = plan.days.find((candidate) => candidate.dayDate === today);
      const items = day?.items ?? [];
      const completedIds = progress[plan.id]?.completedItemIds ?? [];
      const nextItem = items.find((item) => !completedIds.includes(item.id));
      return <View style={styles.plan} key={plan.id}><Text style={styles.planTitle}>{plan.title}</Text><Text style={styles.next}>다음: {nextItem ? itemLabel(nextItem) : "오늘 일정 완료"}</Text>{items.length === 0 ? <Text style={styles.emptyItems}>오늘 등록된 항목이 없습니다.</Text> : items.map((item) => { const completed = completedIds.includes(item.id); return <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: completed }} style={[styles.item, completed && styles.itemDone]} key={item.id} onPress={() => void toggle(plan.id, item.id)}><View style={[styles.check, completed && styles.checkDone]}><Text style={styles.checkText}>{completed ? "✓" : ""}</Text></View><View style={styles.itemBody}><Text style={[styles.itemTitle, completed && styles.itemTitleDone]}>{itemLabel(item)}</Text><Text style={styles.itemMeta}>{item.scheduledTime ?? "시간 미정"} · {item.itemType}</Text></View></Pressable>; })}<Text style={styles.pending}>기기 저장 대기 {progress[plan.id]?.pendingMutations.length ?? 0}건</Text></View>;
    })}
  </Screen>;
}

const styles = StyleSheet.create({ cache: { marginTop: 24, color: "#667085", fontSize: 12 }, empty: { marginTop: 18, padding: 24, borderRadius: 18, backgroundColor: "#f2f4f7" }, plan: { marginTop: 16, padding: 20, borderRadius: 18, backgroundColor: "#175cd3" }, planTitle: { color: "white", fontSize: 21, fontWeight: "800" }, next: { color: "#d1e9ff", marginTop: 8, marginBottom: 12 }, item: { flexDirection: "row", alignItems: "center", gap: 12, padding: 13, marginTop: 8, borderRadius: 12, backgroundColor: "white" }, itemDone: { opacity: 0.68 }, check: { width: 25, height: 25, borderWidth: 2, borderColor: "#175cd3", borderRadius: 8, justifyContent: "center", alignItems: "center" }, checkDone: { backgroundColor: "#175cd3" }, checkText: { color: "white", fontWeight: "900" }, itemBody: { flex: 1 }, itemTitle: { fontWeight: "800" }, itemTitleDone: { textDecorationLine: "line-through" }, itemMeta: { color: "#667085", fontSize: 12, marginTop: 3 }, pending: { color: "#d1e9ff", fontSize: 12, marginTop: 12 }, emptyItems: { color: "white", marginTop: 12 }, title: { fontSize: 18, fontWeight: "800", marginBottom: 8 } });
