export type Tag =
  | "coffee"
  | "matcha"
  | "pastries"
  | "brunch"
  | "lunch";

export interface Shop {
  id: string;
  name: string;
  lat: number;
  lng: number;
  angle: number;
  distKmRaw: number;
  distKm: number;
  mins: number;

  // Google data
  googleRating: number;
  reviews: number;
  priceLevel: 1 | 2 | 3;
  address?: string;
  website?: string;
  googleMapsUrl?: string;

  // Nearest Cup data
  nearestCupScore: number;

  // Kept for compatibility with the current ranking code
  rating: number;
  recentRating: number;
  weightedScore: number;

  tags: Tag[];
  openNow: boolean;
  wifi: boolean;
  hue: number;
}

export const ALL_TAGS: Tag[] = [
  "coffee",
  "matcha",
  "pastries",
  "brunch",
  "lunch",
];

export const TAG_LABEL: Record<Tag, string> = {
  coffee: "Coffee",
  matcha: "Matcha",
  pastries: "Pastries",
  brunch: "Brunch",
  lunch: "Lunch",
};

export const TAG_ICON: Record<Tag, string> = {
  coffee: "☕",
  matcha: "🍵",
  pastries: "🥐",
  brunch: "🍳",
  lunch: "🥪",
};

const WALK_SPEED_KMH = 5;

/*
 * V1 Nearest Cup scoring
 *
 * We start with a confidence-adjusted Google rating.
 *
 * A café with a very high rating but only a handful of reviews
 * should not automatically outrank a café with a slightly lower
 * rating supported by hundreds of reviews.
 *
 * This is NOT the final Coffee Score.
 * Later we will incorporate coffee-specific data.
 */

const SCORE_BASELINE = 4.2;
const SCORE_CONFIDENCE_REVIEWS = 50;

function calculateNearestCupScore(
  rating: number,
  reviews: number
) {
  if (!rating || !reviews) {
    return 0;
  }

  const adjustedRating =
    (reviews / (reviews + SCORE_CONFIDENCE_REVIEWS)) *
      rating +
    (SCORE_CONFIDENCE_REVIEWS /
      (reviews + SCORE_CONFIDENCE_REVIEWS)) *
      SCORE_BASELINE;

  return Math.round(adjustedRating * 100) / 100;
}

function hashHue(str: string) {
  let h = 0;

  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) % 360;
  }

  return h;
}

export function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
) {
  const R = 6371;

  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;

  return (
    R *
    2 *
    Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  );
}

type GooglePlace = {
  id?: string;

  displayName?: {
    text?: string;
  };

  location?: {
    latitude?: number;
    longitude?: number;
  };

  rating?: number;

  userRatingCount?: number;

  priceLevel?: string;

  regularOpeningHours?: {
    openNow?: boolean;
  };

  types?: string[];

  formattedAddress?: string;

  websiteUri?: string;
};

const PLACES_URL =
  "https://places.googleapis.com/v1/places:searchNearby";

const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.location",
  "places.rating",
  "places.userRatingCount",
  "places.priceLevel",
  "places.regularOpeningHours",
  "places.types",
  "places.formattedAddress",
  "places.websiteUri",
].join(",");

function priceLevel(value?: string): 1 | 2 | 3 {
  switch (value) {
    case "PRICE_LEVEL_INEXPENSIVE":
      return 1;

    case "PRICE_LEVEL_MODERATE":
      return 2;

    case "PRICE_LEVEL_EXPENSIVE":
    case "PRICE_LEVEL_VERY_EXPENSIVE":
      return 3;

    default:
      return 2;
  }
}

function tagsForPlace(place: GooglePlace): Tag[] {
  const types = new Set(place.types ?? []);

  const tags: Tag[] = [];

  if (
    types.has("cafe") ||
    types.has("coffee_shop") ||
    types.has("coffee_roastery") ||
    types.has("coffee_stand")
  ) {
    tags.push("coffee");
  }

  if (
    types.has("bakery") ||
    types.has("pastry_shop")
  ) {
    tags.push("pastries");
  }

  if (types.has("brunch_restaurant")) {
    tags.push("brunch");
  }

  if (
    types.has("restaurant") ||
    types.has("meal_takeaway") ||
    types.has("sandwich_shop")
  ) {
    tags.push("lunch");
  }

  return tags.length ? tags : ["coffee"];
}

async function searchPlaces(
  lat: number,
  lng: number,
  includedType: "cafe" | "coffee_shop",
  apiKey: string
): Promise<GooglePlace[]> {
  const response = await fetch(PLACES_URL, {
    method: "POST",

    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": FIELD_MASK,
    },

    body: JSON.stringify({
      includedTypes: [includedType],

      maxResultCount: 20,

      rankPreference: "DISTANCE",

      locationRestriction: {
        circle: {
          center: {
            latitude: lat,
            longitude: lng,
          },

          radius: 2500,
        },
      },

      languageCode: "en",
      regionCode: "IE",
    }),
  });

  if (!response.ok) {
    const message = await response.text();

    throw new Error(
      `Google Places request failed (${response.status}): ${message}`
    );
  }

  const data = (await response.json()) as {
    places?: GooglePlace[];
  };

  return data.places ?? [];
}

export async function buildShops(
  lat: number,
  lng: number
): Promise<Shop[]> {
  const apiKey =
    process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY;

  if (!apiKey) {
    throw new Error(
      "Missing EXPO_PUBLIC_GOOGLE_PLACES_API_KEY"
    );
  }

  const results = await Promise.all([
    searchPlaces(
      lat,
      lng,
      "cafe",
      apiKey
    ),

    searchPlaces(
      lat,
      lng,
      "coffee_shop",
      apiKey
    ),
  ]);

  const unique = new Map<string, GooglePlace>();

  results.flat().forEach((place) => {
    if (place.id) {
      unique.set(place.id, place);
    }
  });

  return [...unique.values()]
    .filter(
      (place) =>
        typeof place.location?.latitude ===
          "number" &&
        typeof place.location?.longitude ===
          "number" &&
        !!place.displayName?.text
    )
    .map((place) => {
      const shopLat =
        place.location!.latitude!;

      const shopLng =
        place.location!.longitude!;

      const distKm = haversineKm(
        lat,
        lng,
        shopLat,
        shopLng
      );

      const googleRating =
        place.rating ?? 0;

      const reviews =
        place.userRatingCount ?? 0;

      const nearestCupScore =
        calculateNearestCupScore(
          googleRating,
          reviews
        );

      const openNow =
        place.regularOpeningHours?.openNow ??
        false;

      return {
        id: place.id!,

        name: place.displayName!.text!,

        lat: shopLat,
        lng: shopLng,

        angle: Math.atan2(
          shopLng - lng,
          shopLat - lat
        ),

        distKmRaw: distKm,
        distKm,

        mins: Math.max(
          1,
          Math.round(
            (distKm / WALK_SPEED_KMH) * 60
          )
        ),

        // Google rating remains separate
        googleRating,

        reviews,

        // Nearest Cup's own score
        nearestCupScore,

        // Compatibility with existing UI
        rating: googleRating,

        recentRating: googleRating,

        weightedScore: nearestCupScore,

        tags: tagsForPlace(place),

        openNow,

        priceLevel: priceLevel(
          place.priceLevel
        ),

        wifi: false,

        hue: hashHue(
          place.displayName!.text!
        ),

        address:
          place.formattedAddress,

        website:
          place.websiteUri,

        googleMapsUrl:
          `https://www.google.com/maps/search/?api=1` +
          `&query=${encodeURIComponent(
            place.displayName!.text!
          )}` +
          `&query_place_id=${encodeURIComponent(
            place.id!
          )}`,
      } satisfies Shop;
    })
    .sort((a, b) => {
      if (
        b.nearestCupScore !==
        a.nearestCupScore
      ) {
        return (
          b.nearestCupScore -
          a.nearestCupScore
        );
      }

      return b.reviews - a.reviews;
    });
}

export interface Filters {
  maxMins: number;
  activeTags: Set<Tag>;
  requireOpen: boolean;
  favoritesOnly: boolean;
  favorites: Set<string>;
}

export function filterAndRank(
  shops: Shop[],
  f: Filters
): Shop[] {
  return shops
    .filter(
      (s) => s.mins <= f.maxMins
    )

    .filter(
      (s) =>
        f.activeTags.size === 0 ||
        s.tags.some((t) =>
          f.activeTags.has(t)
        )
    )

    .filter(
      (s) =>
        !f.requireOpen ||
        s.openNow
    )

    .filter(
      (s) =>
        !f.favoritesOnly ||
        f.favorites.has(s.id)
    )

    .sort((a, b) => {
      if (
        b.nearestCupScore !==
        a.nearestCupScore
      ) {
        return (
          b.nearestCupScore -
          a.nearestCupScore
        );
      }

      return b.reviews - a.reviews;
    });
}

export function starString(
  rating: number
) {
  const full = Math.round(rating);

  return (
    "★".repeat(full) +
    "☆".repeat(5 - full)
  );
}