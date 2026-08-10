import type { components } from "@metrotrip/contracts";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Screen } from "@/lib/Screen";
import { apiFetch } from "@/lib/api";
import { dateInSeoul } from "@/lib/date";
import { loadPlans } from "@/lib/offline";

type Plan = components["schemas"]["PlanView"];
type Notice = components["schemas"]["NoticeView"];
type Station = components["schemas"]["StationSummary"];

export default function HomeScreen() {
  const router = useRouter();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [stations, setStations] = useState<Station[]>([]);
  const [basis, setBasis] = useState("기기 저장본 확인 중");

  const load = useCallback(async () => {
    const cached = await loadPlans<Plan>();
    setPlans(cached.items);
    setBasis(cached.updatedAt ? `계획 기준 ${new Date(cached.updatedAt).toLocaleString("ko-KR")}` : "동기화된 계획 없음");
    const [noticeResult, stationResult] = await Promise.allSettled([
      apiFetch<components["schemas"]["NoticePage"]>("/notices"),
      apiFetch<components["schemas"]["StationPage"]>("/stations?limit=3"),
    ]);
    if (noticeResult.status === "fulfilled") setNotices(noticeResult.value.items);
    if (stationResult.status === "fulfilled") setStations(stationResult.value.items);
  }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const today = dateInSeoul();
  const todayPlan = plans.find((plan) => plan.startDate <= today && plan.endDate >= today);
  return <Screen eyebrow="FIELD HOME" title="지금 필요한 여행" description="오늘 계획과 가까운 탐색 동선을 먼저 보여주는 현장용 홈입니다.">
    <Text style={styles.basis}>{basis}</Text>
    <Pressable accessibilityRole="button" style={styles.hero} onPress={() => router.push(todayPlan ? "/today" as never : "/plans" as never)}>
      <Text style={styles.heroLabel}>{todayPlan ? "TODAY'S TRIP" : "NEXT STEP"}</Text>
      <Text style={styles.heroTitle}>{todayPlan?.title ?? "첫 일정을 동기화해 보세요"}</Text>
      <Text style={styles.heroMeta}>{todayPlan ? `${todayPlan.days.find((day) => day.dayDate === today)?.items.length ?? 0}개 항목 · 당일 모드 열기` : "일정 탭에서 온라인 계획을 기기에 저장할 수 있어요."}</Text>
    </Pressable>
    <View style={styles.quickGrid}><Pressable style={styles.quick} onPress={() => router.push("/explore" as never)}><Text style={styles.quickTitle}>역 주변 탐색</Text><Text style={styles.quickMeta}>{stations.map((item) => item.name).join(" · ") || "역 목록 불러오기"}</Text></Pressable><Pressable style={styles.quick} onPress={() => router.push("/community" as never)}><Text style={styles.quickTitle}>여행 커뮤니티</Text><Text style={styles.quickMeta}>후기와 열린 동행 확인</Text></Pressable></View>
    <View style={styles.notice}><Text style={styles.sectionTitle}>운영 안내</Text>{notices.length ? notices.slice(0, 2).map((item) => <View key={item.id} style={styles.noticeRow}><Text style={styles.noticeTitle}>{item.title}</Text><Text numberOfLines={2}>{item.body}</Text></View>) : <Text style={styles.emptyText}>새 공지가 없습니다.</Text>}</View>
  </Screen>;
}

const styles = StyleSheet.create({ basis: { marginTop: 22, color: "#667085", fontSize: 12 }, hero: { marginTop: 14, padding: 22, minHeight: 170, justifyContent: "flex-end", borderRadius: 22, backgroundColor: "#175cd3" }, heroLabel: { color: "#b2ddff", fontSize: 11, fontWeight: "900", letterSpacing: 1.3 }, heroTitle: { color: "white", fontSize: 24, fontWeight: "900", marginTop: 12 }, heroMeta: { color: "#d1e9ff", marginTop: 8, lineHeight: 21 }, quickGrid: { flexDirection: "row", gap: 10, marginTop: 12 }, quick: { flex: 1, minHeight: 126, padding: 16, borderRadius: 18, backgroundColor: "white" }, quickTitle: { fontWeight: "900", fontSize: 16 }, quickMeta: { color: "#667085", marginTop: 8, lineHeight: 19 }, notice: { marginTop: 24 }, sectionTitle: { fontSize: 19, fontWeight: "900" }, noticeRow: { marginTop: 10, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: "#e4e7ec" }, noticeTitle: { fontWeight: "800", marginBottom: 5 }, emptyText: { color: "#667085", marginTop: 10 } });
