import type { components } from "@metrotrip/contracts";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Screen } from "@/lib/Screen";
import { apiFetch } from "@/lib/api";

type Review = components["schemas"]["ReviewSummary"];
type Recruitment = components["schemas"]["RecruitmentSummary"];

export default function CommunityScreen() {
  const router = useRouter();
  const [mode, setMode] = useState<"reviews" | "together">("reviews");
  const [reviews, setReviews] = useState<Review[]>([]);
  const [recruitments, setRecruitments] = useState<Recruitment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [reviewPage, recruitmentPage] = await Promise.all([
        apiFetch<components["schemas"]["ReviewPage"]>("/reviews?limit=20&sort=latest"),
        apiFetch<components["schemas"]["RecruitmentPage"]>("/recruitments?limit=20&status=OPEN"),
      ]);
      setReviews(reviewPage.items);
      setRecruitments(recruitmentPage.items);
      setError(null);
    } catch { setError("커뮤니티 정보를 불러오지 못했습니다."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const empty = mode === "reviews" ? reviews.length === 0 : recruitments.length === 0;
  return <Screen eyebrow="TRAVEL COMMUNITY" title="기록과 동행" description="후기는 경험 정보, 동행은 상태와 정원이 있는 신청 흐름으로 구분합니다.">
    <View accessibilityRole="tablist" style={styles.tabs}><Pressable accessibilityRole="tab" accessibilityState={{ selected: mode === "reviews" }} style={[styles.tab, mode === "reviews" && styles.activeTab]} onPress={() => setMode("reviews")}><Text style={mode === "reviews" ? styles.activeText : undefined}>여행 후기</Text></Pressable><Pressable accessibilityRole="tab" accessibilityState={{ selected: mode === "together" }} style={[styles.tab, mode === "together" && styles.activeTab]} onPress={() => setMode("together")}><Text style={mode === "together" ? styles.activeText : undefined}>열린 동행</Text></Pressable></View>
    {loading ? <View style={styles.loading} accessibilityLabel="커뮤니티 정보를 불러오는 중"><View style={styles.loadingLine} /><View style={styles.loadingLine} /></View> : null}
    {!loading && error ? <View style={styles.error}><Text style={styles.errorText}>{error}</Text><Pressable onPress={() => void load()}><Text style={styles.retry}>다시 시도</Text></Pressable></View> : null}
    {!loading && !error && empty ? <View style={styles.empty}><Text style={styles.title}>{mode === "reviews" ? "아직 후기가 없어요" : "현재 열린 동행이 없어요"}</Text><Text>온라인 상태에서 다시 불러오거나 다른 여행 흐름을 확인해 보세요.</Text></View> : null}
    {!loading && !error && (mode === "reviews" ? reviews.map((review) => <Pressable accessibilityRole="button" style={styles.card} key={review.id} onPress={() => router.push(`/reviews/${review.id}` as never)}><Text style={styles.route}>{review.originStationName} → {review.destinationStationName}</Text><Text style={styles.title}>{review.title}</Text><Text numberOfLines={2}>{review.excerpt}</Text><View style={styles.meta}><Text>★ {review.rating}</Text><Text>♥ {review.likeCount} · 조회 {review.viewCount}</Text></View></Pressable>) : recruitments.map((item) => <Pressable accessibilityRole="button" style={styles.card} key={item.id} onPress={() => router.push(`/recruitments/${item.id}` as never)}><View style={styles.meta}><Text style={styles.open}>{item.status}</Text><Text>{item.acceptedCount}/{item.capacity}명</Text></View><Text style={styles.title}>{item.title}</Text><Text numberOfLines={2}>{item.body}</Text><Text style={styles.date}>{new Date(item.meetingAt).toLocaleString("ko-KR")}</Text></Pressable>))}
  </Screen>;
}

const styles = StyleSheet.create({ tabs: { flexDirection: "row", marginTop: 24, padding: 4, borderRadius: 14, backgroundColor: "#e4e7ec" }, tab: { flex: 1, minHeight: 46, justifyContent: "center", alignItems: "center", borderRadius: 11 }, activeTab: { backgroundColor: "white" }, activeText: { color: "#175cd3", fontWeight: "900" }, loading: { marginTop: 14, gap: 12 }, loadingLine: { minHeight: 120, borderRadius: 17, backgroundColor: "#e4e7ec" }, error: { marginTop: 12, padding: 14, flexDirection: "row", justifyContent: "space-between", borderRadius: 12, backgroundColor: "#fef3f2" }, errorText: { color: "#b42318" }, retry: { color: "#175cd3", fontWeight: "900" }, empty: { marginTop: 14, padding: 20, borderRadius: 16, backgroundColor: "white" }, card: { marginTop: 12, padding: 18, minHeight: 150, borderRadius: 17, backgroundColor: "white" }, route: { color: "#175cd3", fontSize: 12, fontWeight: "900" }, title: { fontSize: 19, fontWeight: "900", marginVertical: 9 }, meta: { flexDirection: "row", justifyContent: "space-between", gap: 10, marginTop: 13 }, open: { color: "#067647", fontWeight: "900" }, date: { color: "#667085", marginTop: 14 } });
