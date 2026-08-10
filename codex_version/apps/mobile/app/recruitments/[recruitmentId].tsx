import type { components } from "@metrotrip/contracts";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Screen } from "@/lib/Screen";
import { apiFetch } from "@/lib/api";
import { useMobileSession } from "@/lib/session";

type Recruitment = components["schemas"]["RecruitmentDetail"];

export default function RecruitmentDetailScreen() {
  const router = useRouter();
  const { recruitmentId } = useLocalSearchParams<{ recruitmentId: string }>();
  const { status, user } = useMobileSession();
  const [item, setItem] = useState<Recruitment | null>(null);
  const [message, setMessage] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setItem(await apiFetch<Recruitment>(`/recruitments/${recruitmentId}`)); setError(null); } catch { setError("모집 상세를 불러오지 못했습니다."); }
  }, [recruitmentId]);
  useEffect(() => { void load(); }, [load]);

  async function apply() {
    if (status !== "authenticated") { setError("신청은 로그인 후 사용할 수 있습니다."); return; }
    try { await apiFetch(`/recruitments/${recruitmentId}/applications`, { method: "POST", body: JSON.stringify({ message: message || null }) }); setNotice("참여 신청을 보냈습니다."); await load(); } catch { setError("참여 신청을 처리하지 못했습니다."); }
  }
  async function cancel() {
    try { await apiFetch(`/recruitments/${recruitmentId}/applications/me`, { method: "DELETE" }); setNotice("신청을 취소했습니다."); await load(); } catch { setError("신청을 취소하지 못했습니다."); }
  }

  const owner = item?.ownerId === user?.id;
  return <Screen eyebrow="TRAVEL TOGETHER" title={item?.title ?? "동행 상세"} description={item ? `${item.status} · ${item.acceptedCount}/${item.capacity}명 · ${new Date(item.meetingAt).toLocaleString("ko-KR")}` : "모집 정보를 불러오는 중입니다."}>
    <Pressable style={styles.back} onPress={() => router.back()}><Text style={styles.backText}>← 커뮤니티</Text></Pressable>
    {notice ? <Text style={styles.notice}>{notice}</Text> : null}{error ? <View style={styles.error}><Text style={styles.errorText}>{error}</Text><Pressable onPress={() => void load()}><Text style={styles.retry}>다시 시도</Text></Pressable></View> : null}
    {item ? <View style={styles.card}><View style={styles.meta}><Text style={styles.status}>{item.status}</Text><Text>{item.ownerName}</Text></View><Text style={styles.body}>{item.body}</Text><Pressable style={styles.planLink} onPress={() => router.push(`/plans/${item.planId}` as never)}><Text style={styles.planText}>연결 일정 열기</Text></Pressable>{owner ? <Text style={styles.owner}>내가 만든 모집입니다. 수정과 신청자 관리는 Web 운영 화면에서 계속할 수 있습니다.</Text> : item.myApplicationStatus && item.myApplicationStatus !== "CANCELED" ? <View style={styles.applyPanel}><Text>신청 상태: {item.myApplicationStatus}</Text><Pressable style={styles.secondary} onPress={() => void cancel()}><Text style={styles.secondaryText}>신청 취소</Text></Pressable></View> : <View style={styles.applyPanel}><TextInput accessibilityLabel="신청 메시지" value={message} onChangeText={setMessage} style={styles.input} multiline placeholder="호스트에게 전할 메시지" /><Pressable disabled={item.status !== "OPEN"} style={[styles.primary, item.status !== "OPEN" && styles.disabled]} onPress={() => void apply()}><Text style={styles.primaryText}>{item.status === "OPEN" ? "참여 신청" : "모집 마감"}</Text></Pressable></View>}</View> : null}
  </Screen>;
}

const styles = StyleSheet.create({ back: { minHeight: 44, justifyContent: "center", marginTop: 18 }, backText: { color: "#175cd3", fontWeight: "900" }, notice: { marginTop: 10, padding: 12, color: "#067647", backgroundColor: "#ecfdf3", borderRadius: 12 }, error: { marginTop: 12, padding: 14, flexDirection: "row", justifyContent: "space-between", borderRadius: 12, backgroundColor: "#fef3f2" }, errorText: { color: "#b42318" }, retry: { color: "#175cd3", fontWeight: "900" }, card: { marginTop: 16, padding: 20, borderRadius: 18, backgroundColor: "white" }, meta: { flexDirection: "row", justifyContent: "space-between" }, status: { color: "#067647", fontWeight: "900" }, body: { marginTop: 20, fontSize: 17, lineHeight: 28 }, planLink: { minHeight: 46, justifyContent: "center", marginTop: 16 }, planText: { color: "#175cd3", fontWeight: "900" }, owner: { color: "#667085", marginTop: 16, lineHeight: 21 }, applyPanel: { gap: 11, marginTop: 18 }, input: { minHeight: 100, padding: 13, borderWidth: 1, borderColor: "#d0d5dd", borderRadius: 13, textAlignVertical: "top" }, primary: { minHeight: 50, justifyContent: "center", alignItems: "center", borderRadius: 13, backgroundColor: "#175cd3" }, primaryText: { color: "white", fontWeight: "900" }, secondary: { minHeight: 48, justifyContent: "center", alignItems: "center", borderRadius: 13, backgroundColor: "#eff4ff" }, secondaryText: { color: "#175cd3", fontWeight: "900" }, disabled: { opacity: 0.45 } });
