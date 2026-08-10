import type { components } from "@metrotrip/contracts";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Screen } from "@/lib/Screen";
import { apiFetch } from "@/lib/api";
import { loadPlans, savePlans } from "@/lib/offline";
import { useMobileSession } from "@/lib/session";

type Plan = components["schemas"]["PlanView"];

export default function PlansScreen() {
  const router = useRouter();
  const { status } = useMobileSession();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [mode, setMode] = useState("캐시 확인 중");
  const [error, setError] = useState<string | null>(null);

  const sync = useCallback(async () => {
    const cached = await loadPlans<Plan>();
    setPlans(cached.items);
    setMode(cached.updatedAt ? `오프라인 캐시 · ${new Date(cached.updatedAt).toLocaleString("ko-KR")}` : "저장된 오프라인 일정 없음");
    if (status !== "authenticated") return;
    try {
      const page = await apiFetch<components["schemas"]["PlanPage"]>("/plans?limit=50");
      const live = await Promise.all(page.items.map((summary) => apiFetch<Plan>(`/plans/${summary.id}`)));
      setPlans(live);
      await savePlans(live);
      setMode("온라인 동기화 완료");
      setError(null);
    } catch {
      setMode("오프라인 캐시 사용 중");
      setError("최신 일정을 가져오지 못해 마지막 저장본을 표시합니다.");
    }
  }, [status]);

  useEffect(() => { void sync(); }, [sync]);

  return <Screen eyebrow="MY TRIPS" title="내 일정" description="일정의 날짜·항목까지 저장해 오프라인에서도 확인할 수 있어요.">
    <View style={styles.modeRow}><Text style={styles.mode}>{mode}</Text><Pressable accessibilityRole="button" onPress={() => void sync()}><Text style={styles.retry}>다시 동기화</Text></Pressable></View>
    {error ? <Text style={styles.error}>{error}</Text> : null}
    {plans.length === 0 ? <View style={styles.empty}><Text style={styles.title}>저장된 일정이 없어요</Text><Text>웹에서 일정을 만든 뒤 로그인하여 동기화해 주세요.</Text></View> : null}
    {plans.map((plan) => <Pressable accessibilityRole="button" style={styles.card} key={plan.id} onPress={() => router.push(`/plans/${plan.id}` as never)}><Text style={styles.title}>{plan.title}</Text><Text>{plan.startDate} – {plan.endDate}</Text><Text style={styles.meta}>{plan.status} · {plan.days.length}일 · 항목 {plan.days.reduce((sum, day) => sum + day.items.length, 0)}개</Text></Pressable>)}
  </Screen>;
}

const styles = StyleSheet.create({ modeRow: { marginTop: 24, flexDirection: "row", justifyContent: "space-between", gap: 12 }, mode: { color: "#667085", flex: 1 }, retry: { color: "#175cd3", fontWeight: "800" }, error: { color: "#b42318", marginTop: 10 }, empty: { marginTop: 16, padding: 20, borderRadius: 16, backgroundColor: "#f2f4f7" }, card: { padding: 18, marginTop: 12, borderRadius: 16, backgroundColor: "white" }, title: { fontSize: 18, fontWeight: "800", marginBottom: 8 }, meta: { color: "#667085", marginTop: 8 } });
