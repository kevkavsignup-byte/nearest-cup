import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Linking,
} from "react-native";
import * as Location from "expo-location";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  Shop,
  Tag,
  ALL_TAGS,
  TAG_LABEL,
  TAG_ICON,
  buildShops,
  filterAndRank,
  starString,
} from "../lib/shops";

const COLORS = {
  cream: "#F3E9DC",
  cream2: "#EADFCE",
  ink: "#241A12",
  espresso: "#3B2A1E",
  gold: "#C8963E",
  rust: "#9C5B45",
  green: "#5C8A5C",
  card: "#FBF6EE",
  line: "rgba(36,26,18,0.14)",
};

const WALK_OPTIONS = [10, 15, 20];
const FAVORITES_KEY = "nearestcup:favorites";

export default function Index() {
  const [status, setStatus] = useState("Finding your location…");
  const [shops, setShops] = useState<Shop[]>([]);
  const [maxMins, setMaxMins] = useState(10);
  const [activeTags, setActiveTags] = useState<Set<Tag>>(new Set());
  const [requireOpen, setRequireOpen] = useState(false);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(FAVORITES_KEY);
        if (stored) setFavorites(new Set(JSON.parse(stored)));
      } catch (e) {
        // storage unavailable — carry on without persisted favourites
      }

      const { status: permStatus } = await Location.requestForegroundPermissionsAsync();
      if (permStatus !== "granted") {
        setStatus("Location denied — showing a sample area");
        setShops(buildShops(53.3498, -6.2603));
        setLoading(false);
        return;
      }

      try {
        const pos = await Location.getCurrentPositionAsync({});
        setStatus("Using your current location");
        setShops(buildShops(pos.coords.latitude, pos.coords.longitude));
      } catch (e) {
        setStatus("Location unavailable — showing a sample area");
        setShops(buildShops(53.3498, -6.2603));
      }
      setLoading(false);
    })();
  }, []);

  const toggleTag = useCallback((tag: Tag) => {
    setActiveTags((prev) => {
      const next = new Set(prev);
      next.has(tag) ? next.delete(tag) : next.add(tag);
      return next;
    });
  }, []);

  const toggleFavorite = useCallback((id: string) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify([...next])).catch(() => {});
      return next;
    });
  }, []);

  const openDirections = (shop: Shop) => {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${shop.lat},${shop.lng}&travelmode=walking`;
    Linking.openURL(url);
  };

  const ranked = filterAndRank(shops, {
    maxMins,
    activeTags,
    requireOpen,
    favoritesOnly,
    favorites,
  });

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={COLORS.espresso} />
        <Text style={styles.statusText}>{status}</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <Text style={styles.kicker}>Nearest Cup</Text>
      <Text style={styles.title}>Top-rated coffee, within reach.</Text>
      <Text style={styles.status}>{status}</Text>

      <Text style={styles.filterLabel}>Walk time</Text>
      <View style={styles.row}>
        {WALK_OPTIONS.map((mins) => (
          <Pressable
            key={mins}
            onPress={() => setMaxMins(mins)}
            style={[styles.chip, maxMins === mins && styles.chipActive]}
          >
            <Text style={[styles.chipText, maxMins === mins && styles.chipTextActive]}>
              {mins} min
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.filterLabel}>What you're after</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.rowScroll}
        contentContainerStyle={{ alignItems: "center" }}
      >
        {ALL_TAGS.map((tag) => (
          <Pressable
            key={tag}
            onPress={() => toggleTag(tag)}
            style={[styles.chip, activeTags.has(tag) && styles.chipTagActive]}
          >
            <Text style={[styles.chipText, activeTags.has(tag) && styles.chipTextActive]}>
              {TAG_LABEL[tag]}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <View style={styles.row}>
        <Pressable
          onPress={() => setRequireOpen((v) => !v)}
          style={[styles.chip, requireOpen && styles.chipStatusActive]}
        >
          <Text style={[styles.chipText, requireOpen && styles.chipTextActive]}>Open now</Text>
        </Pressable>
        <Pressable
          onPress={() => setFavoritesOnly((v) => !v)}
          style={[styles.chip, favoritesOnly && styles.chipStatusActive]}
        >
          <Text style={[styles.chipText, favoritesOnly && styles.chipTextActive]}>
            Favourites
          </Text>
        </Pressable>
      </View>

      <FlatList
        data={ranked}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingTop: 8, paddingBottom: 40 }}
        ListEmptyComponent={
          <Text style={styles.empty}>Nothing matches — try widening the walk or clearing a filter.</Text>
        }
        renderItem={({ item, index }) => (
          <View style={styles.card}>
            <View style={[styles.photo, { backgroundColor: `hsl(${item.hue}, 48%, 42%)` }]}>
              <Text style={{ fontSize: 22 }}>{TAG_ICON[item.tags[1] ?? "coffee"]}</Text>
            </View>
            <View style={styles.cardMid}>
              <Text style={styles.rank}>No. {index + 1}</Text>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.meta}>
                {item.reviews} reviews · {"€".repeat(item.priceLevel)}
                <Text style={{ opacity: 0.3 }}>{"€".repeat(3 - item.priceLevel)}</Text>
              </Text>
              <Text style={styles.stars}>
                {starString(item.rating)} <Text style={styles.ratingNum}>{item.rating.toFixed(1)}</Text>
              </Text>
              <View style={styles.infoRow}>
                <Text style={[styles.pill, item.openNow ? styles.pillOpen : styles.pillClosed]}>
                  {item.openNow ? "Open now" : "Closed"}
                </Text>
                {item.wifi && <Text style={styles.pill}>📶 Wifi</Text>}
              </View>
              <View style={styles.actionRow}>
                <Pressable
                  onPress={() => toggleFavorite(item.id)}
                  style={[styles.iconBtn, favorites.has(item.id) && styles.iconBtnOn]}
                >
                  <Text>{favorites.has(item.id) ? "♥" : "♡"}</Text>
                </Pressable>
                <Pressable onPress={() => openDirections(item)} style={styles.directionsBtn}>
                  <Text style={styles.directionsText}>Directions →</Text>
                </Pressable>
              </View>
            </View>
            <View style={styles.cardRight}>
              <Text style={styles.walk}>{item.mins}′</Text>
              <Text style={styles.walkLabel}>{item.distKm.toFixed(1)} km</Text>
            </View>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.cream, paddingHorizontal: 18, paddingTop: 56 },
  center: { flex: 1, backgroundColor: COLORS.cream, alignItems: "center", justifyContent: "center", gap: 10 },
  kicker: { color: COLORS.rust, fontWeight: "700", fontSize: 13, marginBottom: 2 },
  title: { color: COLORS.ink, fontWeight: "700", fontSize: 26, marginBottom: 8 },
  status: { color: COLORS.ink, opacity: 0.7, fontSize: 13, marginBottom: 16 },
  statusText: { color: COLORS.ink, opacity: 0.7 },
  filterLabel: { fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6, color: COLORS.ink, opacity: 0.5, marginBottom: 8, marginTop: 4 },
  row: { flexDirection: "row", gap: 8, marginBottom: 16, flexWrap: "wrap" },
  rowScroll: { marginBottom: 16, height: 44 },
  chip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 100, borderWidth: 1, borderColor: COLORS.line, marginRight: 8 },
  chipActive: { backgroundColor: COLORS.espresso, borderColor: COLORS.espresso },
  chipTagActive: { backgroundColor: COLORS.rust, borderColor: COLORS.rust },
  chipStatusActive: { backgroundColor: COLORS.green, borderColor: COLORS.green },
  chipText: { color: COLORS.ink, fontSize: 13, fontWeight: "500", lineHeight: 16 },
  chipTextActive: { color: COLORS.cream },
  card: { flexDirection: "row", backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.line, borderRadius: 14, padding: 14, marginBottom: 12, gap: 12 },
  photo: { width: 56, height: 56, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  cardMid: { flex: 1 },
  rank: { color: COLORS.gold, fontWeight: "700", fontSize: 12, marginBottom: 2 },
  name: { color: COLORS.ink, fontWeight: "700", fontSize: 17, marginBottom: 3 },
  meta: { color: COLORS.ink, opacity: 0.7, fontSize: 12.5, marginBottom: 5 },
  stars: { color: COLORS.gold, fontSize: 13 },
  ratingNum: { color: COLORS.ink, opacity: 0.75 },
  infoRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
  pill: { fontSize: 11, paddingVertical: 3, paddingHorizontal: 9, borderRadius: 100, backgroundColor: COLORS.cream2, color: COLORS.ink, overflow: "hidden" },
  pillOpen: { color: COLORS.green, fontWeight: "700" },
  pillClosed: { opacity: 0.55 },
  actionRow: { flexDirection: "row", gap: 8, marginTop: 10, alignItems: "center" },
  iconBtn: { width: 30, height: 30, borderRadius: 9, borderWidth: 1, borderColor: COLORS.line, alignItems: "center", justifyContent: "center" },
  iconBtnOn: { backgroundColor: COLORS.rust, borderColor: COLORS.rust },
  directionsBtn: { height: 30, paddingHorizontal: 11, borderRadius: 9, borderWidth: 1, borderColor: COLORS.line, alignItems: "center", justifyContent: "center" },
  directionsText: { fontSize: 12, fontWeight: "700", color: COLORS.ink },
  cardRight: { alignItems: "flex-end", justifyContent: "flex-start" },
  walk: { fontSize: 18, fontWeight: "700", color: COLORS.ink },
  walkLabel: { fontSize: 11, color: COLORS.ink, opacity: 0.6, marginTop: 2 },
  empty: { textAlign: "center", opacity: 0.6, marginTop: 30, paddingHorizontal: 20 },
});