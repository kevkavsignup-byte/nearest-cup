import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import MapView, {
  Marker,
  PROVIDER_GOOGLE,
} from "react-native-maps";

import { Ionicons } from "@expo/vector-icons";

import {
  ALL_TAGS,
  CoffeeRating,
  Shop,
  TAG_ICON,
  TAG_LABEL,
  Tag,
  buildShops,
  calculatePersonalMatch,
  calculateShopCoffeeScores,
  calculateUserCoffeeProfile,
  filterAndRank,
  getShopDrinkScore,
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
const COFFEE_RATINGS_KEY = "nearestCupCoffeeRatings";

function formatClosingTime(
  closingTime?: string | null
) {
  if (!closingTime) return null;

  const date = new Date(closingTime);

  return date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

const DRINK_TYPES = [
  "Flat white",
  "Cappuccino",
  "Latte",
  "Espresso",
  "Filter",
];

export default function Index() {
  const [status, setStatus] = useState("Finding your location…");
  const [coffeeRatings, setCoffeeRatings] = useState<CoffeeRating[]>([]);
  const [shops, setShops] = useState<Shop[]>([]);
  const [maxMins, setMaxMins] = useState(10);
  const [activeTags, setActiveTags] = useState<Set<Tag>>(new Set());
  const [activeDrinkType, setActiveDrinkType] =
  useState<string | null>(null);
  const [requireOpen, setRequireOpen] = useState(false);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"list" | "map">("list");
  const [userLocation, setUserLocation] = useState<{
  latitude: number;
  longitude: number;
} | null>(null);
  const [selectedShop, setSelectedShop] = useState<Shop | null>(null);
  const [showCafeDetails, setShowCafeDetails] = useState(false);
  const [mapRegion, setMapRegion] = useState({
  latitude: 53.3498,
  longitude: -6.2603,
  latitudeDelta: 0.03,
  longitudeDelta: 0.03,
});
  const mapRef = useRef<MapView>(null);
  const [showMapFilters, setShowMapFilters] = useState(false);
  const [selectedMarkerId, setSelectedMarkerId] =
  useState<string | null>(null);
  const [ratingShop, setRatingShop] = useState<Shop | null>(null);
  const [coffeeRating, setCoffeeRating] = useState(0);
  const [drinkType, setDrinkType] = useState("");
  const toggleDrinkType = useCallback(
  (type: string) => {
    setActiveDrinkType((current) =>
      current === type ? "" : type
    );
  },
  []
);
  const [consistencyRating, setConsistencyRating] = useState(0);
  const userCoffeeProfile = calculateUserCoffeeProfile(
    coffeeRatings
  );
  
useEffect(() => {
  const loadCoffeeRatings = async () => {
    try {
      const savedRatings = await AsyncStorage.getItem(
        COFFEE_RATINGS_KEY
      );

      if (savedRatings) {
  const parsedRatings = JSON.parse(savedRatings);

  if (Array.isArray(parsedRatings)) {
  const validRatings = parsedRatings.filter(
    (rating) =>
      rating &&
      typeof rating.shopId === "string" &&
      typeof rating.rating === "number" &&
      rating.rating >= 1 &&
      rating.rating <= 5 &&
      typeof rating.drinkType === "string" &&
      typeof rating.createdAt === "string"
  );

  setCoffeeRatings(validRatings);
}
}
    } catch (error) {
      console.log("Could not load coffee ratings:", error);
    }
  };

     loadCoffeeRatings();
}, []);

  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(FAVORITES_KEY);
        if (stored) setFavorites(new Set(JSON.parse(stored)));
      } catch (e) {
        // storage unavailable — carry on without persisted favourites
      }

      const { status: permStatus } =
        await Location.requestForegroundPermissionsAsync();

      if (permStatus !== "granted") {
        setStatus("Location denied — unable to find nearby cafés");
        setLoading(false);
        return;
      }

      try {
        const pos = await Location.getCurrentPositionAsync({});

        setUserLocation({
  latitude: pos.coords.latitude,
  longitude: pos.coords.longitude,
});

        setStatus("Finding cafés near you…");

        const nearbyShops = await buildShops(
          pos.coords.latitude,
          pos.coords.longitude
        );

        setShops(nearbyShops);

        setStatus(
          nearbyShops.length
            ? "Using your current location"
            : "No cafés found nearby"
        );
      } catch (e) {
        setStatus(
          e instanceof Error
            ? e.message
            : "Could not load nearby cafés"
        );
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

      AsyncStorage.setItem(
        FAVORITES_KEY,
        JSON.stringify([...next])
      ).catch(() => {});

      return next;
    });
  }, []);

  const openDirections = (shop: Shop) => {
    const url =
      shop.googleMapsUrl ??
      `https://www.google.com/maps/dir/?api=1&destination=${shop.lat},${shop.lng}&travelmode=walking`;

    Linking.openURL(url);
  };

  const ranked = filterAndRank(
  shops,
  {
    maxMins,
    activeTags,
    activeDrinkType: activeDrinkType || null,
    requireOpen,
    favoritesOnly,
    favorites,
  },
  coffeeRatings
);

const getClusteredShops = () => {
  if (ranked.length === 0) {
    return [];
  }

  const clusterRadius =
  mapRegion.latitudeDelta * 0.04;

  const clusters: Array<{
    shops: typeof ranked;
    latitude: number;
    longitude: number;
  }> = [];

  for (const shop of ranked) {
    const existingCluster = clusters.find((cluster) => {
      const latitudeDifference = Math.abs(
        shop.lat - cluster.latitude
      );

      const longitudeDifference = Math.abs(
        shop.lng - cluster.longitude
      );

      return (
        latitudeDifference < clusterRadius &&
        longitudeDifference < clusterRadius
      );
    });

    if (existingCluster) {
      existingCluster.shops.push(shop);

      existingCluster.latitude =
        existingCluster.shops.reduce(
          (total, item) => total + item.lat,
          0
        ) / existingCluster.shops.length;

      existingCluster.longitude =
        existingCluster.shops.reduce(
          (total, item) => total + item.lng,
          0
        ) / existingCluster.shops.length;
    } else {
      clusters.push({
        shops: [shop],
        latitude: shop.lat,
        longitude: shop.lng,
      });
    }
  }

  return clusters;
};

const clusteredShops = getClusteredShops();

const fitMapToShops = () => {
  if (!mapRef.current || !userLocation || clusteredShops.length === 0) {
    return;
  }

  const coordinates = [
    {
      latitude: userLocation.latitude,
      longitude: userLocation.longitude,
    },
    ...clusteredShops.map((cluster) => ({
      latitude: cluster.latitude,
      longitude: cluster.longitude,
    })),
  ];

  mapRef.current.fitToCoordinates(coordinates, {
    edgePadding: {
      top: 100,
      right: 50,
      bottom: 180,
      left: 50,
    },
    animated: true,
  });
};

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

      <Text style={styles.title}>
        Top-rated coffee, within reach.
      </Text>

      <Text style={styles.status}>{status}</Text>

      <View style={styles.viewToggle}>
  <Pressable
    onPress={() => setViewMode("list")}
    style={[
      styles.viewToggleButton,
      viewMode === "list" &&
        styles.viewToggleButtonActive,
    ]}
  >
    <Text
      style={[
        styles.viewToggleText,
        viewMode === "list" &&
          styles.viewToggleTextActive,
      ]}
    >
      List
    </Text>
  </Pressable>

  <Pressable
    onPress={() => setViewMode("map")}
    style={[
      styles.viewToggleButton,
      viewMode === "map" &&
        styles.viewToggleButtonActive,
    ]}
  >
    <Text
      style={[
        styles.viewToggleText,
        viewMode === "map" &&
          styles.viewToggleTextActive,
      ]}
    >
      Map
    </Text>
  </Pressable>
</View>

     {(viewMode === "list" || showMapFilters) && (
  <>
    <Text style={styles.filterLabel}>Walk time</Text>

      <View style={styles.row}>
        {WALK_OPTIONS.map((mins) => (
          <Pressable
            key={mins}
            onPress={() => setMaxMins(mins)}
            style={[
              styles.chip,
              maxMins === mins && styles.chipActive,
            ]}
          >
            <Text
              style={[
                styles.chipText,
                maxMins === mins && styles.chipTextActive,
              ]}
            >
              {mins} min
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.filterLabel}>
        What you're after
      </Text>

      <View
  style={{
    height: 64,
    marginBottom: 0,
    overflow: "visible",
  }}
>
  <ScrollView
    horizontal
    showsHorizontalScrollIndicator={false}
    contentContainerStyle={{
      alignItems: "center",
      paddingHorizontal: 8,
      paddingVertical: 12,
    }}
>
  {ALL_TAGS.map((tag) => (
    <Pressable
      key={tag}
      onPress={() => toggleTag(tag)}
      style={[
        styles.chip,
        activeTags.has(tag) && styles.chipTagActive,
      ]}
    >
      <Text
        style={[
          styles.chipText,
          activeTags.has(tag) && styles.chipTextActive,
        ]}
      >
        {TAG_LABEL[tag]}
      </Text>
    </Pressable>
  ))}
</ScrollView>
</View>

<View style={{ 
  height: 64, 
  marginBottom:0, 
  overflow: "visible" 
  }}
  >
  <ScrollView
    horizontal
    showsHorizontalScrollIndicator={false}
    contentContainerStyle={{
      alignItems: "center",
      paddingHorizontal: 8,
      paddingVertical: 12,
    }}
  >
    {DRINK_TYPES.map((type) => (
      <Pressable
        key={type}
        onPress={() => toggleDrinkType(type)}
        style={[
          styles.chip,
          activeDrinkType === type &&
            styles.chipTagActive,
        ]}
      >
        <Text
          style={[
            styles.chipText,
            activeDrinkType === type &&
              styles.chipTextActive,
          ]}
        >
          {type}
        </Text>
      </Pressable>
    ))}
  </ScrollView>
</View>

      <View style={styles.row}>
        <Pressable
          onPress={() => setRequireOpen((v) => !v)}
          style={[
            styles.chip,
            requireOpen && styles.chipStatusActive,
          ]}
        >
          <Text
            style={[
              styles.chipText,
              requireOpen && styles.chipTextActive,
            ]}
          >
            Open now
          </Text>
        </Pressable>

        <Pressable
          onPress={() => setFavoritesOnly((v) => !v)}
          style={[
            styles.chip,
            favoritesOnly && styles.chipStatusActive,
          ]}
        >
          <Text
            style={[
              styles.chipText,
              favoritesOnly && styles.chipTextActive,
            ]}
          >
              Favourites
          </Text>
        </Pressable>
      </View>
  </>
)}

{viewMode === "map" ? (
  <View style={styles.mapContainer}>

    {userLocation && (
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_GOOGLE}
        initialRegion={{
          latitude: userLocation.latitude,
          longitude: userLocation.longitude,
          latitudeDelta: 0.03,
          longitudeDelta: 0.03,
        }}
        onRegionChangeComplete={setMapRegion}
        showsUserLocation
        showsMyLocationButton
        mapType="standard"
        onMapReady={fitMapToShops}
      >
        {clusteredShops.map((cluster) => {
  const isSingleShop = cluster.shops.length === 1;

  if (isSingleShop) {
    const shop = cluster.shops[0];
    const isSelected = selectedMarkerId === shop.id;

    return (
      <Marker
        key={shop.id}
        coordinate={{
          latitude: shop.lat,
          longitude: shop.lng,
        }}
        onPress={() => {
          setSelectedMarkerId(shop.id);
          setSelectedShop(shop);
        }}
        anchor={{ x: 0.5, y: 0.5 }}
      >
        <View
          style={[
            styles.mapMarker,
            isSelected && styles.mapMarkerSelected,
          ]}
        >
          <Ionicons
            name="cafe-outline"
            size={isSelected ? 22 : 18}
            color="#33261D"
          />
        </View>
      </Marker>
    );
  }

  return (
    <Marker
      key={`cluster-${cluster.shops
        .map((item) => item.id)
        .join("-")}`}
      coordinate={{
        latitude: cluster.latitude,
        longitude: cluster.longitude,
      }}
      onPress={() => {
        mapRef.current?.animateToRegion({
          latitude: cluster.latitude,
          longitude: cluster.longitude,
          latitudeDelta: mapRegion.latitudeDelta / 3,
          longitudeDelta: mapRegion.longitudeDelta / 3,
      }, 400);
      }}
      anchor={{ x: 0.5, y: 0.5 }}
    >
      <View style={styles.mapCluster}>
  <Text style={styles.mapClusterNumber}>
    {cluster.shops.length}
  </Text>
  <Text style={styles.mapClusterLabel}>
    cafés
  </Text>
</View>
    </Marker>
  );
})}
      </MapView>
)}


    <Pressable
  style={styles.mapFiltersButton}
  onPress={() => setShowMapFilters((value) => !value)}
>
  <Text style={styles.mapFiltersButtonText}>
    {showMapFilters ? "Hide filters" : "Filters"}
  </Text>
</Pressable>

    {selectedShop && (
  <View style={styles.mapPreview}>
    <View style={styles.mapPreviewTopRow}>
      <View style={styles.mapPreviewMain}>
        <Text style={styles.mapPreviewName}>
          {selectedShop.name}
        </Text>

        <Text style={styles.mapPreviewInfo}>
          ⭐{" "}
          {calculateShopCoffeeScores(
            selectedShop.id,
            coffeeRatings
          ).nearestCupScore.toFixed(1)}
          {"  ·  "}
          {selectedShop.mins} min walk
        </Text>
      </View>

      <Pressable
        onPress={() => setSelectedShop(null)}
        style={styles.mapPreviewClose}
      >
        <Text style={styles.mapPreviewCloseText}>
          ✕
        </Text>
      </Pressable>
    </View>

    {activeDrinkType && (
      <View style={styles.mapPreviewDrinkRow}>
        <Text style={styles.mapPreviewDrinkName}>
          {activeDrinkType}
        </Text>

        <Text style={styles.mapPreviewDrinkScore}>
          ★{" "}
          {getShopDrinkScore(
            selectedShop.id,
            activeDrinkType,
            coffeeRatings
          ).toFixed(1)}
        </Text>
      </View>
    )}

    <View style={styles.mapPreviewActions}>
      <Pressable
        onPress={() => openDirections(selectedShop)}
        style={styles.mapPreviewButtonSecondary}
      >
        <Text style={styles.mapPreviewButtonSecondaryText}>
          Directions
        </Text>
      </Pressable>

      <Pressable
  onPress={() => {
    if (!selectedShop) return;
    setShowCafeDetails(true);
  }}
  style={styles.mapPreviewButton}
>
        <Text style={styles.mapPreviewButtonText}>
          View café
        </Text>
      </Pressable>
    </View>
  </View>
)}
  </View>
) : (
      <FlatList
        data={ranked}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{
          paddingTop: 8,
          paddingBottom: 40,
        }}
        ListEmptyComponent={
          <Text style={styles.empty}>
            Nothing matches — try widening the walk or
            clearing a filter.
          </Text>
        }
        renderItem={({ item, index }) => (
          <Pressable
            style={styles.card}
            onPress={() => {
  setSelectedShop(item);
  setShowCafeDetails(true);
}}
          >
            <View
              style={[
                styles.photo,
                {
                  backgroundColor: `hsl(${item.hue}, 48%, 42%)`,
                },
              ]}
            >
              <Text style={{ fontSize: 22 }}>
                {TAG_ICON[item.tags[1] ?? "coffee"]}
              </Text>
            </View>

            <View style={styles.cardMid}>
              <Text style={styles.rank}>
                No. {index + 1}
              </Text>

              <Text style={styles.name}>
                {item.name}
              </Text>

          
            {(() => {
  const scores = calculateShopCoffeeScores(
    item.id,
    coffeeRatings
  );

  if (scores.coffeeQualityRatings === 0) {
    return null;
  }

  const ratingCount =
    scores.coffeeQualityRatings;

  let confidence = "First Sips";

  if (ratingCount >= 10) {
    confidence = "Well Tasted";
  } else if (ratingCount >= 5) {
    confidence = "A Solid Cup";
  } else if (ratingCount >= 2) {
    confidence = "Taking Shape";
  }

 const personalMatch =
  calculatePersonalMatch(
    scores,
    userCoffeeProfile,
    activeDrinkType
  );

  return (
    <>
      <Text style={styles.nearestCupCardScore}>
        ☕{" "}
        {scores.nearestCupScore.toFixed(1)}
        {" · "}
        {confidence}
      </Text>

     {personalMatch.score > 0 && (
  <Text style={styles.personalMatchCardScore}>
    For You{" "}
    {personalMatch.score.toFixed(1)}
    {" · "}
    {activeDrinkType
      ? activeDrinkType.toLowerCase() + "s"
      : "coffee"}
  </Text>
)}
    </>
  );
})()}

<Text style={styles.stars}>
  Google{" "}
  {starString(item.rating)}{" "}
  <Text style={styles.ratingNum}>
    {item.rating.toFixed(1)}
  </Text>
</Text>

<Text style={styles.meta}>
  {item.reviews.toLocaleString()} Google reviews ·{" "}
  {"€".repeat(item.priceLevel)}
  <Text style={{ opacity: 0.3 }}>
    {"€".repeat(3 - item.priceLevel)}
  </Text>
</Text>

{item.openNow && item.closingTime && (
  <Text style={styles.openingHours}>
    Open · Closes{" "}
    {formatClosingTime(item.closingTime)}
  </Text>
)}

             <View style={styles.actionRow}>
  <Text
    style={[
      styles.pill,
      item.openNow
        ? styles.pillOpen
        : styles.pillClosed,
    ]}
  >
    {item.openNow ? "Open now" : "Closed"}
  </Text>

  {item.wifi && (
    <Text style={styles.pill}>
      📶 Wifi
    </Text>
  )}

  <Pressable
    onPress={(event) => {
      event.stopPropagation();
      toggleFavorite(item.id);
    }}
    style={[
      styles.iconBtn,
      favorites.has(item.id) &&
        styles.iconBtnOn,
    ]}
  >
    <Text>
      {favorites.has(item.id)
        ? "♥"
        : "♡"}
    </Text>
  </Pressable>

  <Pressable
    onPress={(event) => {
      event.stopPropagation();
      openDirections(item);
    }}
    style={styles.directionsBtn}
  >
    <Text style={styles.directionsText}>
      Directions →
    </Text>
  </Pressable>
</View>
            </View>

            <View style={styles.cardRight}>
              <Text style={styles.walk}>
                {item.mins}′
              </Text>

              <Text style={styles.walkLabel}>
                {item.distKm.toFixed(1)} km
              </Text>
            </View>
          </Pressable>
        )}
      />
)}


      <Modal
  visible={selectedShop !== null && showCafeDetails}
        animationType="slide"
        transparent
        onRequestClose={() => {
  setShowCafeDetails(false);
  setSelectedShop(null);
}}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.detailCard}>
  <ScrollView
    showsVerticalScrollIndicator={false}
    contentContainerStyle={{ paddingBottom: 10 }}
  >
    {selectedShop && (
              <>
                <View style={styles.detailTopRow}>
                  <Text style={styles.detailKicker}>
                    Nearest Cup
                  </Text>

                  <Pressable
                    onPress={() => {
  setShowCafeDetails(false);
  setSelectedShop(null);
}}
                    style={styles.closeBtn}
                  >
                    <Text style={styles.closeText}>
                      ✕
                    </Text>
                  </Pressable>
                </View>

                <View
                  style={[
                    styles.detailPhoto,
                    {
                      backgroundColor: `hsl(${selectedShop.hue}, 48%, 42%)`,
                    },
                  ]}
                >
                  <Text style={{ fontSize: 36 }}>
                    {
                      TAG_ICON[
                        selectedShop.tags[0] ??
                          "coffee"
                      ]
                    }
                  </Text>
                </View>

                <Text style={styles.detailName}>
                  {selectedShop.name}
                </Text>

                <Text style={styles.detailRating}>
                  {starString(selectedShop.rating)}{" "}
                  <Text
                    style={styles.detailRatingNumber}
                  >
                    {selectedShop.rating.toFixed(1)}
                  </Text>
                </Text>

                <Text style={styles.detailReviews}>
                  {selectedShop.reviews.toLocaleString()}{" "}
                  Google reviews ·{" "}
                  {"€".repeat(selectedShop.priceLevel)}
                </Text>

                <View style={styles.detailStatusRow}>
                  <Text
                    style={[
                      styles.detailStatus,
                      selectedShop.openNow
                        ? styles.detailStatusOpen
                        : styles.detailStatusClosed,
                    ]}
                  >
                    {selectedShop.openNow
                      ? "Open now"
                      : "Closed"}
                  </Text>

                  <Text style={styles.detailWalk}>
                    {selectedShop.mins} min walk ·{" "}
                    {selectedShop.distKm.toFixed(1)} km
                  </Text>
                </View>
{selectedShop.address && (
  <View style={styles.detailSection}>
    <Text style={styles.detailSectionTitle}>
      Address
    </Text>

    <Text style={styles.detailBody}>
      {selectedShop.address}
    </Text>
  </View>
)}

<View style={styles.nearestCupScoreBox}>
  <Text style={styles.scoreLabel}>
    NEAREST CUP SCORE
  </Text>

  {(() => {
    const scores = calculateShopCoffeeScores(
      selectedShop.id,
      coffeeRatings
    );

    const ratingCount = scores.coffeeQualityRatings;

    let confidence = "First Sips";

    if (ratingCount >= 10) {
      confidence = "Well Tasted";
    } else if (ratingCount >= 5) {
      confidence = "A Solid Cup";
    } else if (ratingCount >= 2) {
      confidence = "Taking Shape";
    }

    return (
      <>
        <Text style={styles.scoreValue}>
          {scores.nearestCupScore > 0
            ? scores.nearestCupScore.toFixed(1)
            : "—"}
        </Text>

        <Text style={styles.scoreNote}>
          {ratingCount === 0
            ? "No Nearest Cup ratings yet."
            : `Based on ${ratingCount} Nearest Cup ${
                ratingCount === 1 ? "rating" : "ratings"
              }. ${confidence}.`}
        </Text>

        {ratingCount > 0 && (
          <Text style={styles.scoreNote}>
            Combines coffee quality, drink-specific ratings and consistency.
          </Text>
        )}
      </>
    );
  })()}
</View>
{selectedShop && (
  <View style={styles.personalMatchBox}>
    <Text style={styles.scoreLabel}>
      FOR YOU
    </Text>

    {(() => {
      const shopScores = calculateShopCoffeeScores(
        selectedShop.id,
        coffeeRatings
      );

      const match = calculatePersonalMatch(
        shopScores,
        userCoffeeProfile,
        activeDrinkType
      );

      return (
        <>
          <Text style={styles.scoreValue}>
            {match.score > 0
              ? match.score.toFixed(1)
              : "—"}
          </Text>

          <Text style={styles.scoreNote}>
            {match.reason}
          </Text>

          {match.score > 0 && (
            <Text style={styles.scoreNote}>
              Based on your coffee preferences and this café's ratings.
            </Text>
          )}
        </>
      );
    })()}
  </View>
)}


<View style={styles.detailActions}>
  <Pressable
    onPress={() =>
      toggleFavorite(selectedShop.id)
    }
    style={[
      styles.detailFavoriteBtn,
      favorites.has(selectedShop.id) &&
        styles.detailFavoriteBtnActive,
    ]}
  >
    <Text style={styles.detailFavoriteText}>
      {favorites.has(selectedShop.id)
        ? "♥ Saved"
        : "♡ Save"}
    </Text>
  </Pressable>

  <Pressable
    onPress={() =>
      openDirections(selectedShop)
    }
    style={styles.detailDirectionsBtn}
  >
    <Text style={styles.detailDirectionsText}>
      Directions →
    </Text>
  </Pressable>
</View>

{selectedShop.website && (
  <Pressable
    onPress={() =>
      Linking.openURL(
        selectedShop.website!
      )
    }
    style={styles.websiteBtn}
  >
    <Text style={styles.websiteText}>
      Visit website ↗
    </Text>
  </Pressable>
)}

<View style={styles.coffeeProfile}>
  <Text style={styles.coffeeProfileTitle}>Coffee profile</Text>

  {(() => {
    const scores = calculateShopCoffeeScores(
      selectedShop.id,
      coffeeRatings
    );

    return (
      <>
      {scores.coffeeQualityRatings > 0 && (
  <View style={styles.profileRow}>
    <Text style={styles.profileLabel}>
      Coffee quality
    </Text>
    <Text style={styles.profileValue}>
      {scores.coffeeQualityScore.toFixed(1)}
    </Text>
  </View>
)}

        {scores.milkDrinksRatings > 0 && (
          <View style={styles.profileRow}>
            <Text style={styles.profileLabel}>Milk drinks</Text>
            <Text style={styles.profileValue}>
              {scores.milkDrinksScore.toFixed(1)}
            </Text>
          </View>
        )}

        {scores.espressoRatings > 0 && (
          <View style={styles.profileRow}>
            <Text style={styles.profileLabel}>Espresso</Text>
            <Text style={styles.profileValue}>
              {scores.espressoScore.toFixed(1)}
            </Text>
          </View>
        )}

        {scores.filterRatings > 0 && (
          <View style={styles.profileRow}>
            <Text style={styles.profileLabel}>Filter</Text>
            <Text style={styles.profileValue}>
              {scores.filterScore.toFixed(1)}
            </Text>
          </View>
        )}

        {scores.consistencyRatings > 0 && (
          <View style={styles.profileRow}>
            <Text style={styles.profileLabel}>Consistency</Text>
            <Text style={styles.profileValue}>
              {scores.consistencyScore.toFixed(1)}
            </Text>
          </View>
        )}
      </>
    );
  })()}
</View>

<Pressable
  onPress={() => {
    if (!selectedShop) return;

    const existingRating = coffeeRatings.find(
      (rating) => rating.shopId === selectedShop.id
    );

    if (existingRating) {
      setCoffeeRating(existingRating.rating);
      setDrinkType(existingRating.drinkType);
      setConsistencyRating(
        existingRating.consistencyRating ?? 0
      );
    } else {
      setCoffeeRating(0);
      setDrinkType("");
      setConsistencyRating(0);
    }

    setRatingShop(selectedShop);
  }}
  style={styles.rateCoffeeBtn}
>
  <Text style={styles.rateCoffeeText}>
    {coffeeRatings.some(
      (rating) => rating.shopId === selectedShop?.id
    )
      ? "★ Update your rating"
      : "★ Rate this coffee"}
  </Text>
</Pressable>
                </>
              )}
           </ScrollView>
             </View>
  </View>
</Modal>

<Modal
  visible={ratingShop !== null}
  animationType="slide"
  transparent
  onRequestClose={() => setRatingShop(null)}
>
  <View style={styles.modalBackdrop}>
    <View style={styles.ratingCard}>
      <View style={styles.detailTopRow}>
        <Text style={styles.detailKicker}>
          Rate your coffee
        </Text>

        <Pressable
  onPress={() => setRatingShop(null)}
  style={styles.closeBtn}
>
  <Text style={styles.closeText}>✕</Text>
</Pressable>
</View>

      {ratingShop && (
        <>
          <Text style={styles.ratingShopName}>
            {ratingShop.name}
          </Text>

          <Text style={styles.ratingQuestion}>
  How was the coffee?
</Text>

<Text style={styles.ratingHint}>
  Rate the coffee itself — taste, preparation and quality.
</Text>

          <View style={styles.starRatingRow}>
            {[1, 2, 3, 4, 5].map((star) => (
              <Pressable
                key={star}
                onPress={() => setCoffeeRating(star)}
              >
                <Text
                  style={[
                    styles.ratingStar,
                    star <= coffeeRating &&
                      styles.ratingStarSelected,
                  ]}
                >
                  ★
                </Text>
              </Pressable>
            ))}
          </View>

         <Text style={styles.ratingQuestion}>
  What did you have?
</Text>

<Text style={styles.ratingHint}>
  This helps us build a coffee profile for each café.
</Text>

          <View style={styles.drinkOptions}>
            {[
              "Flat white",
              "Cappuccino",
              "Latte",
              "Espresso",
              "Filter",
              "Matcha",
              "Other",
            ].map((drink) => (
              <Pressable
                key={drink}
                onPress={() => setDrinkType(drink)}
                style={[
                  styles.drinkOption,
                  drinkType === drink &&
                    styles.drinkOptionSelected,
                ]}
              >
                <Text
                  style={[
                    styles.drinkOptionText,
                    drinkType === drink &&
                      styles.drinkOptionTextSelected,
                  ]}
                >
                  {drink}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.ratingQuestion}>
  How consistent was the coffee?
</Text>

<Text style={styles.ratingHint}>
  How reliably good do you expect the coffee to be here?
</Text>

<View style={styles.starRatingRow}>
  {[1, 2, 3, 4, 5].map((star) => (
    <Pressable
      key={star}
      onPress={() => setConsistencyRating(star)}
    >
      <Text
        style={[
          styles.ratingStar,
          star <= consistencyRating &&
            styles.ratingStarSelected,
        ]}
      >
        ★
      </Text>
    </Pressable>
  ))}
</View>

          <Pressable
            onPress={async () => {
  if (
  !ratingShop ||
  coffeeRating <= 0 ||
  drinkType === "" ||
  consistencyRating <= 0
) {
  return;
}

  const newRating: CoffeeRating = {
    shopId: ratingShop.id,
    rating: coffeeRating,
    drinkType,
    consistencyRating,
    createdAt: new Date().toISOString(),
  };

  try {
    const existingRatings = await AsyncStorage.getItem(
      COFFEE_RATINGS_KEY
    );

    const ratings: CoffeeRating[] = existingRatings
      ? JSON.parse(existingRatings)
      : [];

    const existingRatingIndex = ratings.findIndex(
      (rating) => rating.shopId === newRating.shopId
    );

    if (existingRatingIndex >= 0) {
  // Update existing rating for this café
      ratings[existingRatingIndex] = newRating;
    } else {
  // First rating for this café
      ratings.push(newRating);
}

    await AsyncStorage.setItem(
      COFFEE_RATINGS_KEY,
      JSON.stringify(ratings)
    );

    setCoffeeRatings(ratings);

    setRatingShop(null);
    setCoffeeRating(0);
    setDrinkType("");
    setConsistencyRating(0);
  } catch (error) {
    console.log("Could not save coffee rating:", error);
  }
}}
style={[
    styles.submitRatingBtn,
    (coffeeRating <= 0 ||
    drinkType === "" ||
    consistencyRating <= 0) &&
      styles.submitRatingBtnDisabled,
  ]}
          >
            <Text style={styles.submitRatingText}>
              Submit rating
            </Text>
          </Pressable>
        </>
      )}
    </View>
  </View>
</Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.cream,
    paddingHorizontal: 18,
    paddingTop: 56,
  },

  center: {
    flex: 1,
    backgroundColor: COLORS.cream,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },

  kicker: {
    color: COLORS.rust,
    fontWeight: "700",
    fontSize: 13,
    marginBottom: 2,
  },

  title: {
    color: COLORS.ink,
    fontWeight: "700",
    fontSize: 26,
    marginBottom: 8,
  },

  status: {
    color: COLORS.ink,
    opacity: 0.7,
    fontSize: 13,
    marginBottom: 16,
  },

  statusText: {
    color: COLORS.ink,
    opacity: 0.7,
  },

  filterLabel: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    color: COLORS.ink,
    opacity: 0.5,
    marginBottom: 8,
    marginTop: 4,
  },

  row: {
  flexDirection: "row",
  marginBottom: 16,
  flexWrap: "wrap",
},


  chip: {
  height: 36,
  paddingHorizontal: 14,
  borderRadius: 100,
  borderWidth: 1,
  borderColor: COLORS.line,
  marginRight: 8,
  alignItems: "center",
  justifyContent: "center",
},

  chipActive: {
    backgroundColor: COLORS.espresso,
    borderColor: COLORS.espresso,
  },

  chipTagActive: {
    backgroundColor: COLORS.rust,
    borderColor: COLORS.rust,
  },

  chipStatusActive: {
    backgroundColor: COLORS.green,
    borderColor: COLORS.green,
  },

  chipText: {
  color: COLORS.ink,
  fontSize: 13,
  fontWeight: "500",
},

  chipTextActive: {
    color: COLORS.cream,
  },

  card: {
    flexDirection: "row",
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    gap: 12,
  },

  photo: {
    width: 56,
    height: 56,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },

  cardMid: {
    flex: 1,
  },

  rank: {
    color: COLORS.gold,
    fontWeight: "700",
    fontSize: 12,
    marginBottom: 2,
  },

  name: {
    color: COLORS.ink,
    fontWeight: "700",
    fontSize: 17,
    marginBottom: 3,
  },

  meta: {
    color: COLORS.ink,
    opacity: 0.7,
    fontSize: 12.5,
    marginBottom: 5,
  },

  stars: {
    marginTop: 6,

    color: COLORS.gold,
    fontSize: 13,
  },

  ratingNum: {
    color: COLORS.ink,
    opacity: 0.75,
  },

  infoRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    alignItems: "center",
  },

  pill: {
    fontSize: 11,
    paddingVertical: 3,
    paddingHorizontal: 9,
    borderRadius: 100,
    backgroundColor: COLORS.cream2,
    color: COLORS.ink,
    overflow: "hidden",
  },

  pillOpen: {
    color: COLORS.green,
    fontWeight: "700",
  },

  pillClosed: {
    opacity: 0.55,
  },

  actionRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
    alignItems: "center",
  },

  iconBtn: {
  width: 30,
  paddingVertical: 3,
  borderRadius: 100,
  borderWidth: 1,
  borderColor: COLORS.line,
  alignItems: "center",
  justifyContent: "center",
},

  iconBtnOn: {
    backgroundColor: COLORS.rust,
    borderColor: COLORS.rust,
  },

  directionsBtn: {
  paddingVertical: 3,
  paddingHorizontal: 9,
  borderRadius: 100,
  borderWidth: 1,
  borderColor: COLORS.line,
  alignItems: "center",
  justifyContent: "center",
},

  directionsText: {
    fontSize: 11,
    fontWeight: "700",
    color: COLORS.ink,
  },

  cardRight: {
    alignItems: "flex-end",
    justifyContent: "flex-start",
  },

  walk: {
    fontSize: 18,
    fontWeight: "700",
    color: COLORS.ink,
  },

  walkLabel: {
    fontSize: 11,
    color: COLORS.ink,
    opacity: 0.6,
    marginTop: 2,
  },

  empty: {
    textAlign: "center",
    opacity: 0.6,
    marginTop: 30,
    paddingHorizontal: 20,
  },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(36,26,18,0.45)",
    justifyContent: "flex-end",
  },

  detailCard: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 22,
    paddingBottom: 34,
    maxHeight: "90%",
  },

  detailTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },

  detailKicker: {
    color: COLORS.rust,
    fontWeight: "700",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },

  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: COLORS.cream2,
    alignItems: "center",
    justifyContent: "center",
  },

  closeText: {
    color: COLORS.ink,
    fontSize: 16,
    fontWeight: "700",
  },

  detailPhoto: {
    width: "100%",
    height: 110,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },

  detailName: {
    color: COLORS.ink,
    fontWeight: "700",
    fontSize: 25,
    marginBottom: 6,
  },

  detailRating: {
    color: COLORS.gold,
    fontSize: 16,
    marginBottom: 4,
  },

  detailRatingNumber: {
    color: COLORS.ink,
    fontWeight: "700",
  },

  detailReviews: {
    color: COLORS.ink,
    opacity: 0.65,
    fontSize: 13,
  },

  detailStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 14,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.line,
  },

  detailStatus: {
    fontSize: 12,
    fontWeight: "700",
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 100,
    backgroundColor: COLORS.cream2,
    overflow: "hidden",
  },

  detailStatusOpen: {
    color: COLORS.green,
  },

  detailStatusClosed: {
    color: COLORS.ink,
    opacity: 0.55,
  },

  detailWalk: {
    color: COLORS.ink,
    opacity: 0.65,
    fontSize: 12,
  },

  detailSection: {
    marginTop: 16,
  },

  detailSectionTitle: {
    color: COLORS.ink,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    opacity: 0.5,
    marginBottom: 5,
  },

  detailBody: {
    color: COLORS.ink,
    fontSize: 14,
    lineHeight: 20,
  },

  nearestCupScoreBox: {
  marginTop: 10,
  padding: 16,
  borderRadius: 14,
  backgroundColor: COLORS.cream,
  borderWidth: 0,
},

  scoreLabel: {
    color: COLORS.ink,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.8,
    opacity: 0.55,
  },

  scoreValue: {
    color: COLORS.espresso,
    fontSize: 34,
    fontWeight: "700",
    marginTop: 3,
  },

  scoreNote: {
    color: COLORS.ink,
    opacity: 0.6,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 3,
  },

  openingHours: {
  marginTop: 4,
  fontSize: 12,
  fontWeight: "600",
  color: COLORS.espresso,
},

  detailActions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 18,
  },

  detailFavoriteBtn: {
    flex: 1,
    height: 46,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: COLORS.line,
    alignItems: "center",
    justifyContent: "center",
  },

  detailFavoriteBtnActive: {
    backgroundColor: COLORS.rust,
    borderColor: COLORS.rust,
  },

  detailFavoriteText: {
    color: COLORS.ink,
    fontWeight: "700",
    fontSize: 13,
  },

  detailDirectionsBtn: {
    flex: 1.5,
    height: 46,
    borderRadius: 11,
    backgroundColor: COLORS.espresso,
    alignItems: "center",
    justifyContent: "center",
  },

  detailDirectionsText: {
    color: COLORS.cream,
    fontWeight: "700",
    fontSize: 13,
  },

  websiteBtn: {
    alignItems: "center",
    paddingTop: 16,
  },

  websiteText: {
    color: COLORS.rust,
    fontSize: 13,
    fontWeight: "700",
  },

rateCoffeeBtn: {
  alignItems: "center",
  marginTop: 14,
  paddingVertical: 13,
  borderRadius: 11,
  borderWidth: 1,
  borderColor: COLORS.rust,
},

rateCoffeeText: {
  color: COLORS.rust,
  fontSize: 13,
  fontWeight: "700",
},
ratingCard: {
  backgroundColor: COLORS.card,
  borderTopLeftRadius: 24,
  borderTopRightRadius: 24,
  padding: 22,
  paddingBottom: 34,
},

ratingShopName: {
  color: COLORS.ink,
  fontSize: 22,
  fontWeight: "700",
  marginBottom: 22,
},

ratingQuestion: {
  color: COLORS.ink,
  fontSize: 13,
  fontWeight: "700",
  marginBottom: 10,
},

ratingHint: {
  marginTop: -4,
  marginBottom: 10,
  fontSize: 12,
  color: COLORS.ink,
  opacity: 0.5,
},

starRatingRow: {
  flexDirection: "row",
  gap: 8,
  marginBottom: 24,
},

ratingStar: {
  fontSize: 38,
  color: COLORS.line,
},

ratingStarSelected: {
  color: COLORS.gold,
},

drinkOptions: {
  flexDirection: "row",
  flexWrap: "wrap",
  gap: 8,
  marginBottom: 24,
},

drinkOption: {
  paddingVertical: 9,
  paddingHorizontal: 13,
  borderRadius: 100,
  borderWidth: 1,
  borderColor: COLORS.line,
},

drinkOptionSelected: {
  backgroundColor: COLORS.espresso,
  borderColor: COLORS.espresso,
},

drinkOptionText: {
  color: COLORS.ink,
  fontSize: 12,
},

drinkOptionTextSelected: {
  color: COLORS.cream,
  fontWeight: "700",
},

submitRatingBtn: {
  height: 48,
  borderRadius: 11,
  backgroundColor: COLORS.espresso,
  alignItems: "center",
  justifyContent: "center",
},

submitRatingText: {
  color: COLORS.cream,
  fontSize: 13,
  fontWeight: "700",
},

submitRatingBtnDisabled: {
  opacity: 0.45,
},
coffeeProfile: {
  marginTop: 10,
  padding: 16,
  borderRadius: 14,
  backgroundColor: COLORS.cream2,
},

coffeeProfileTitle: {
  fontSize: 14,
  fontWeight: "700",
  color: COLORS.ink,
  marginBottom: 10,
},

profileRow: {
  flexDirection: "row",
  justifyContent: "space-between",
  paddingVertical: 5,
},

profileLabel: {
  fontSize: 13,
  color: COLORS.ink,
},

profileValue: {
  fontSize: 13,
  fontWeight: "700",
  color: COLORS.rust,
},
nearestCupCardScore: {
  marginTop: 5,
  fontSize: 15,
  fontWeight: "800",
  color: COLORS.espresso,
},
personalMatchCardScore: {
  marginTop: 3,
  fontSize: 12,
  fontWeight: "600",
  color: COLORS.rust,
},
personalMatchBox: {
  marginTop: 12,
  padding: 16,
  borderRadius: 12,
  backgroundColor: COLORS.cream,
},

viewToggle: {
  flexDirection: "row",
  alignSelf: "center",
  marginBottom: 12,
  borderRadius: 20,
  overflow: "hidden",
  borderWidth: 1,
  borderColor: COLORS.line,
},

viewToggleButton: {
  paddingHorizontal: 20,
  paddingVertical: 8,
},

viewToggleButtonActive: {
  backgroundColor: COLORS.espresso,
},

viewToggleText: {
  color: COLORS.ink,
  fontWeight: "600",
},

viewToggleTextActive: {
  color: COLORS.cream,
},

mapMarker: {
  width: 42,
  height: 42,
  borderRadius: 21,
  backgroundColor: "#F4EBDD",
  borderWidth: 2,
  borderColor: "#33261D",
  alignItems: "center",
  justifyContent: "center",
  shadowColor: "#000",
  shadowOffset: {
    width: 0,
    height: 2,
  },
  shadowOpacity: 0.15,
  shadowRadius: 3,
  elevation: 3,
},

mapMarkerSelected: {
  width: 50,
  height: 50,
  borderRadius: 25,
  backgroundColor: "#FFFFFF",
  borderWidth: 3,
  borderColor: "#33261D",
  shadowColor: "#000",
  shadowOffset: {
    width: 0,
    height: 3,
  },
  shadowOpacity: 0.2,
  shadowRadius: 4,
  elevation: 5,
},

mapCluster: {
  minWidth: 48,
  height: 48,
  paddingHorizontal: 6,
  borderRadius: 24,
  backgroundColor: "#FFFFFF",
  alignItems: "center",
  justifyContent: "center",
  borderWidth: 2,
  borderColor: "#33261D",
  shadowColor: "#000",
  shadowOffset: {
    width: 0,
    height: 2,
  },
  shadowOpacity: 0.15,
  shadowRadius: 3,
  elevation: 3,
},

mapClusterNumber: {
  fontSize: 15,
  fontWeight: "700",
  lineHeight: 17,
  color: "#33261D",
},

mapClusterLabel: {
  fontSize: 8,
  fontWeight: "600",
  lineHeight: 9,
  color: "#33261D",
},

mapContainer: {
  flex: 1,
  marginTop: 8,
  overflow: "hidden",
  borderRadius: 16,
},

map: {
  flex: 1,
},

mapPreview: {
  position: "absolute",
  left: 16,
  right: 16,
  bottom: 16,
  backgroundColor: COLORS.card,
  borderRadius: 22,
  padding: 18,
  borderWidth: 1,
  borderColor: COLORS.line,
  shadowColor: "#000",
  shadowOpacity: 0.18,
  shadowRadius: 10,
  shadowOffset: {
    width: 0,
    height: 4,
  },
  elevation: 8,
},

mapPreviewTopRow: {
  flexDirection: "row",
  alignItems: "flex-start",
},

mapPreviewMain: {
  flex: 1,
},
mapPreviewName: {
  color: COLORS.ink,
  fontSize: 19,
  fontWeight: "700",
  lineHeight: 23,
},

mapPreviewInfo: {
  marginTop: 5,
  color: COLORS.espresso,
  fontSize: 13,
  fontWeight: "600",
},

mapPreviewClose: {
  width: 32,
  height: 32,
  borderRadius: 16,
  alignItems: "center",
  justifyContent: "center",
  backgroundColor: COLORS.cream2,
},

mapPreviewCloseText: {
  color: COLORS.espresso,
  fontSize: 16,
  fontWeight: "700",
},

mapPreviewDrinkRow: {
  marginTop: 16,
  paddingTop: 12,
  paddingBottom: 12,
  paddingHorizontal: 12,
  borderRadius: 12,
  backgroundColor: COLORS.cream2,
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "center",
},

mapPreviewDrinkName: {
  color: COLORS.ink,
  fontSize: 14,
  fontWeight: "600",
},

mapPreviewDrinkScore: {
  color: COLORS.espresso,
  fontSize: 14,
  fontWeight: "700",
},

mapPreviewActions: {
  flexDirection: "row",
  gap: 10,
  marginTop: 16,
},

mapFiltersButton: {
  position: "absolute",
  top: 28,
  left: 28,
  backgroundColor: "#FFFFFF",
  paddingHorizontal: 16,
  paddingVertical: 10,
  borderRadius: 22,
  borderWidth: 1,
  borderColor: "#33261D",
  elevation: 3,
  shadowOpacity: 0.15,
  shadowRadius: 4,
  shadowOffset: {
    width: 0,
    height: 2,
  },
},

mapFiltersButtonText: {
  color: "#33261D",
  fontSize: 14,
  fontWeight: "600",
},

mapPreviewButton: {
  flex: 1,
  backgroundColor: COLORS.espresso,
  borderRadius: 12,
  paddingVertical: 14,
  alignItems: "center",
},

mapPreviewButtonText: {
  color: COLORS.cream,
  fontSize: 14,
  fontWeight: "700",
},

mapPreviewButtonSecondary: {
  flex: 1,
  backgroundColor: COLORS.cream2,
  borderRadius: 12,
  paddingVertical: 14,
  alignItems: "center",
},

mapPreviewButtonSecondaryText: {
  color: COLORS.espresso,
  fontSize: 14,
  fontWeight: "700",
},
});