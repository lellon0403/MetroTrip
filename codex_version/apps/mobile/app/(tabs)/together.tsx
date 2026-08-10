import type { components } from "@metrotrip/contracts";
import { Screen } from "@/lib/Screen";
import { apiFetch } from "@/lib/api";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

type Recruitment = components["schemas"]["RecruitmentSummary"];
export default function TogetherScreen() { const [items, setItems] = useState<Recruitment[]>([]); useEffect(() => { void apiFetch<components["schemas"]["RecruitmentPage"]>("/recruitments?limit=20").then((data) => setItems(data.items)); }, []); return <Screen eyebrow="TRAVEL TOGETHER" title="동행 찾기" description="내 계획과 맞는 열린 모집을 현장에서 확인하세요.">{items.map((item) => <View style={styles.card} key={item.id}><View style={styles.meta}><Text style={styles.status}>{item.status}</Text><Text>{item.acceptedCount}/{item.capacity}명</Text></View><Text style={styles.title}>{item.title}</Text><Text numberOfLines={2}>{item.body}</Text><Text style={styles.date}>{new Date(item.meetingAt).toLocaleString("ko-KR")}</Text></View>)}</Screen>; }
const styles = StyleSheet.create({ card: { marginTop: 14, padding: 18, borderRadius: 16, backgroundColor: "white" }, meta: { flexDirection: "row", justifyContent: "space-between" }, status: { color: "#067647", fontWeight: "800" }, title: { fontSize: 19, fontWeight: "800", marginVertical: 10 }, date: { color: "#667085", marginTop: 14 } });
