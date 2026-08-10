import type { components } from "@metrotrip/contracts";
import * as Location from "expo-location";
import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Screen } from "@/lib/Screen";
import { apiFetch } from "@/lib/api";
import { nearestByCoordinate } from "@/lib/geo";

type Station = components["schemas"]["StationSummary"];
type StationDetail = components["schemas"]["StationDetail"];
type Departure = components["schemas"]["Departure"];
type Place = components["schemas"]["PlaceSummary"];
type PlaceDetail = components["schemas"]["PlaceDetail"];
type Route = components["schemas"]["RouteComparison"];

export default function ExploreScreen() {
  const [query, setQuery] = useState("");
  const [stations, setStations] = useState<Station[]>([]);
  const [selected, setSelected] = useState<Station | null>(null);
  const [stationDetail, setStationDetail] = useState<StationDetail | null>(null);
  const [departures, setDepartures] = useState<Departure[]>([]);
  const [places, setPlaces] = useState<Place[]>([]);
  const [placeDetail, setPlaceDetail] = useState<PlaceDetail | null>(null);
  const [radius, setRadius] = useState(1000);
  const [route, setRoute] = useState<Route | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [locationState, setLocationState] = useState("위치는 요청 전까지 수집하지 않습니다.");

  const loadStations = useCallback(async () => {
    try {
      const data = await apiFetch<components["schemas"]["StationPage"]>(`/stations?limit=30&query=${encodeURIComponent(query)}`);
      setStations(data.items);
      setSelected((current) => data.items.find((item) => item.id === current?.id) ?? data.items[0] ?? null);
      setError(null);
    } catch { setError("역 목록을 불러오지 못했습니다."); }
  }, [query]);
  useEffect(() => { const timer = setTimeout(() => void loadStations(), 250); return () => clearTimeout(timer); }, [loadStations]);

  useEffect(() => {
    if (!selected) return;
    setRoute(null);
    void Promise.all([
      apiFetch<StationDetail>(`/stations/${selected.id}`),
      apiFetch<components["schemas"]["DepartureList"]>(`/stations/${selected.id}/departures?limit=3`),
      apiFetch<components["schemas"]["PlacePage"]>(`/places/nearby?station_id=${selected.id}&radius_meters=${radius}`),
    ]).then(([detail, schedule, nearby]) => { setStationDetail(detail); setDepartures(schedule.items); setPlaces(nearby.items); setPlaceDetail(null); setError(null); }).catch(() => setError("선택한 역의 현장 정보를 불러오지 못했습니다."));
  }, [radius, selected]);

  async function selectPlace(place: Place) {
    try { setPlaceDetail(await apiFetch<PlaceDetail>(`/places/${place.id}`)); setRoute(null); } catch { setError("장소 상세를 불러오지 못했습니다."); }
  }
  async function compareRoute() {
    if (!selected || !placeDetail) return;
    try { setRoute(await apiFetch<Route>("/routes/compare", { method: "POST", body: JSON.stringify({ origin: { type: "STATION", id: selected.id }, destination: { type: "PLACE", id: placeDetail.id }, modes: ["TRANSIT", "WALK"] }) })); } catch { setError("경로를 비교하지 못했습니다."); }
  }
  async function locate() {
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) { setLocationState("위치 권한이 꺼져 있어 역 검색으로 계속 탐색합니다."); return; }
      const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      let candidates = stations;
      try {
        const stationPage = await apiFetch<components["schemas"]["StationPage"]>("/stations?limit=100");
        candidates = stationPage.items;
        setStations(stationPage.items);
      } catch {
        // 네트워크 오류 시 화면에 이미 있는 역 목록으로 위치 폴백을 계속한다.
      }
      const nearest = nearestByCoordinate(current.coords, candidates);
      if (!nearest) {
        setLocationState("비교할 역 목록이 없어 역 이름 검색으로 계속 탐색해 주세요.");
        return;
      }
      setSelected(nearest.item);
      setLocationState(`가까운 역 ${nearest.item.name} · 약 ${Math.round(nearest.distanceMeters)}m · 위치는 서버에 저장하지 않음`);
    } catch {
      setLocationState("현재 위치를 확인하지 못했습니다. 역 이름 검색으로 계속 탐색할 수 있습니다.");
    }
  }

  return <Screen eyebrow="EXPLORE NEARBY" title="역에서 바로 찾기" description="개발 지도와 동일한 목록으로 역·장소·시간표·경로를 한 손으로 확인합니다.">
    <TextInput accessibilityLabel="역 검색" style={styles.search} value={query} onChangeText={setQuery} placeholder="역 이름 검색" />
    <Pressable style={styles.location} onPress={() => void locate()}><Text style={styles.locationText}>내 위치 권한으로 가까운 역 찾기</Text></Pressable><Text style={styles.hint}>{locationState}</Text>
    {error ? <View style={styles.error}><Text style={styles.errorText}>{error}</Text><Pressable onPress={() => void loadStations()}><Text style={styles.retry}>다시 시도</Text></Pressable></View> : null}
    <View style={styles.chips}>{stations.map((station) => <Pressable key={station.id} style={[styles.chip, selected?.id === station.id && styles.activeChip]} onPress={() => setSelected(station)}><Text style={selected?.id === station.id ? styles.activeChipText : undefined}>{station.name}</Text></Pressable>)}</View>
    <View accessibilityLabel="개발 지도" style={styles.map}><View><Text style={styles.mapLabel}>DEVELOPMENT MAP</Text><Text style={styles.mapTitle}>{selected?.name ?? "역 선택"}</Text></View><Text style={styles.mocked}>MOCKED · 지도 SDK 미연결</Text><View style={styles.rail} /><View style={styles.stationDot} /></View>
    <View style={styles.sheet}><View style={styles.grabber} /><Text style={styles.sheetTitle}>{stationDetail?.name ?? selected?.name ?? "역을 선택하세요"}</Text><Text style={styles.hint}>{stationDetail?.address ?? "목록은 지도와 동등한 탐색 경로입니다."}</Text><View style={styles.departures}>{departures.map((item) => <View key={`${item.tripId}-${item.scheduledAt}`}><Text style={styles.time}>{new Date(item.scheduledAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}</Text><Text>{item.headsign} 방면</Text></View>)}</View><View style={styles.radius}>{[500, 1000, 2000].map((value) => <Pressable key={value} style={[styles.radiusButton, radius === value && styles.radiusActive]} onPress={() => setRadius(value)}><Text style={radius === value ? styles.activeChipText : undefined}>{value >= 1000 ? `${value / 1000}km` : `${value}m`}</Text></Pressable>)}</View>{places.map((place) => <Pressable style={styles.place} key={place.id} onPress={() => void selectPlace(place)}><View><Text style={styles.placeName}>{place.name}</Text><Text style={styles.hint}>{place.category} · {Math.round(place.distanceMeters ?? 0)}m</Text></View><Text>{place.dataStatus}</Text></Pressable>)}{places.length === 0 ? <Text style={styles.empty}>이 반경에 표시할 장소가 없습니다.</Text> : null}</View>
    {placeDetail ? <View style={styles.detail}><Text style={styles.detailTitle}>{placeDetail.name}</Text><Text>{placeDetail.summary ?? placeDetail.address}</Text><Text style={styles.fixture}>{placeDetail.dataStatus} · 실제 영업정보 아님</Text><Pressable style={styles.primary} onPress={() => void compareRoute()}><Text style={styles.primaryText}>이동 경로 비교</Text></Pressable>{route?.options.map((option) => <View style={styles.route} key={option.id}><Text style={styles.routeTitle}>{option.mode} · {option.durationMinutes}분</Text><Text>{option.dataBasis} · {option.estimated ? "추정" : "측정"} · {option.algorithmVersion}</Text></View>)}</View> : null}
  </Screen>;
}

const styles = StyleSheet.create({ search: { minHeight: 50, marginTop: 24, paddingHorizontal: 15, borderWidth: 1, borderColor: "#d0d5dd", borderRadius: 14, backgroundColor: "white" }, location: { marginTop: 10, minHeight: 48, justifyContent: "center", alignItems: "center", borderRadius: 14, backgroundColor: "#eff4ff" }, locationText: { color: "#175cd3", fontWeight: "800" }, hint: { color: "#667085", marginTop: 6, fontSize: 12, lineHeight: 18 }, error: { flexDirection: "row", justifyContent: "space-between", gap: 12, marginTop: 12, padding: 12, borderRadius: 12, backgroundColor: "#fef3f2" }, errorText: { color: "#b42318", flex: 1 }, retry: { color: "#175cd3", fontWeight: "800" }, chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 16 }, chip: { minHeight: 42, justifyContent: "center", paddingHorizontal: 14, borderRadius: 999, backgroundColor: "white" }, activeChip: { backgroundColor: "#175cd3" }, activeChipText: { color: "white", fontWeight: "800" }, map: { minHeight: 220, marginTop: 18, padding: 20, justifyContent: "space-between", overflow: "hidden", borderRadius: 22, backgroundColor: "#102a5e" }, mapLabel: { color: "#b2ddff", fontSize: 10, fontWeight: "900", letterSpacing: 1.2 }, mapTitle: { color: "white", fontSize: 30, fontWeight: "900", marginTop: 8 }, mocked: { color: "#d1e9ff", fontSize: 11 }, rail: { position: "absolute", left: 42, right: 42, top: 140, height: 5, borderRadius: 5, backgroundColor: "#53b1fd", transform: [{ rotate: "-12deg" }] }, stationDot: { position: "absolute", left: "50%", top: 120, width: 28, height: 28, marginLeft: -14, borderWidth: 7, borderColor: "white", borderRadius: 20, backgroundColor: "#175cd3" }, sheet: { marginTop: -22, padding: 20, paddingTop: 12, borderRadius: 22, backgroundColor: "white" }, grabber: { alignSelf: "center", width: 42, height: 4, marginBottom: 13, borderRadius: 4, backgroundColor: "#d0d5dd" }, sheetTitle: { fontSize: 22, fontWeight: "900" }, departures: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 }, time: { color: "#175cd3", fontWeight: "900" }, radius: { flexDirection: "row", gap: 7, marginTop: 16 }, radiusButton: { minHeight: 40, justifyContent: "center", paddingHorizontal: 14, borderRadius: 999, backgroundColor: "#f2f4f7" }, radiusActive: { backgroundColor: "#175cd3" }, place: { minHeight: 68, marginTop: 9, padding: 13, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: 13, backgroundColor: "#f8fafc" }, placeName: { fontWeight: "900" }, empty: { color: "#667085", paddingVertical: 20 }, detail: { marginTop: 14, padding: 20, borderRadius: 18, backgroundColor: "white" }, detailTitle: { fontSize: 22, fontWeight: "900", marginBottom: 8 }, fixture: { color: "#b54708", marginTop: 10, fontSize: 12 }, primary: { minHeight: 48, justifyContent: "center", alignItems: "center", marginTop: 16, borderRadius: 13, backgroundColor: "#175cd3" }, primaryText: { color: "white", fontWeight: "900" }, route: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#e4e7ec" }, routeTitle: { fontWeight: "900", marginBottom: 4 } });
