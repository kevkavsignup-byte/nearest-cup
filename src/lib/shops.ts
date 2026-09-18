export type Tag =
  | "coffee"
  | "matcha"
  | "pastries"
  | "brunch"
  | "lunch";

  export type CoffeeRating = {
  shopId: string;
  rating: number;
  drinkType: string;
  consistencyRating?: number;
  createdAt: string;
};

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

  // Nearest Cup proprietary coffee data
  coffeeQualityScore: number;
  consistencyScore: number;
  milkDrinksScore: number;
  espressoScore: number;
  filterScore: number;

  coffeeQualityRatings: number;
  consistencyRatings: number;
  milkDrinksRatings: number;
  espressoRatings: number;
  filterRatings: number;

  nearestCupScore: number;

  // Kept for compatibility with the current UI/ranking code
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
 * Nearest Cup Coffee Score
 *
 * This score is deliberately separate from Google.
 *
 * Google provides:
 * - overall public rating
 * - review count
 * - location
 * - opening hours
 * - etc.
 *
 * Nearest Cup will eventually provide:
 * - coffee quality
 * - consistency
 * - milk drinks
 * - espresso
 * - filter coffee
 *
 * Until we have genuine Nearest Cup ratings,
 * nearestCupScore remains 0 and the UI should
 * display it as unavailable.
 */

function calculateNearestCupScore(
  coffeeQualityScore: number,
  consistencyScore: number,
  milkDrinksScore: number,
  espressoScore: number,
  filterScore: number
): number {
  const components = [
  {
    score: coffeeQualityScore,
    weight: 0.4,
  },
  {
    score: consistencyScore,
    weight: 0.2,
  },
  {
    score: milkDrinksScore,
    weight: 0.15,
  },
  {
    score: espressoScore,
    weight: 0.15,
  },
  {
    score: filterScore,
    weight: 0.1,
  },
].filter((component) => component.score > 0);

  const available = components.filter(
    (component) => component.score > 0
  );

  if (available.length === 0) {
    return 0;
  }

  const totalWeight = available.reduce(
    (sum, component) =>
      sum + component.weight,
    0
  );

  const weightedScore = available.reduce(
    (sum, component) =>
      sum +
      component.score *
        component.weight,
    0
  );

  return Math.round(
    (weightedScore / totalWeight) * 100
  ) / 100;
}

function hashHue(str: string) {
  let h = 0;

  for (let i = 0; i < str.length; i++) {
    h =
      (h * 31 +
        str.charCodeAt(i)) %
      360;
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

  const dLat =
    ((lat2 - lat1) * Math.PI) /
    180;

  const dLng =
    ((lng2 - lng1) * Math.PI) /
    180;

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(
      (lat1 * Math.PI) / 180
    ) *
      Math.cos(
        (lat2 * Math.PI) / 180
      ) *
      Math.sin(dLng / 2) ** 2;

  return (
    R *
    2 *
    Math.atan2(
      Math.sqrt(a),
      Math.sqrt(1 - a)
    )
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

  businessStatus?: string;
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
  "places.businessStatus",
].join(",");

function priceLevel(
  value?: string
): 1 | 2 | 3 {
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

function tagsForPlace(
  place: GooglePlace
): Tag[] {
  const types = new Set(
    place.types ?? []
  );

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

  if (
    types.has(
      "brunch_restaurant"
    )
  ) {
    tags.push("brunch");
  }

  if (
    types.has("restaurant") ||
    types.has("meal_takeaway") ||
    types.has("sandwich_shop")
  ) {
    tags.push("lunch");
  }

  return tags.length
    ? tags
    : ["coffee"];
}

async function searchPlaces(
  lat: number,
  lng: number,
  includedType:
    | "cafe"
    | "coffee_shop",
  apiKey: string
): Promise<GooglePlace[]> {
  const response = await fetch(
    PLACES_URL,
    {
      method: "POST",

      headers: {
        "Content-Type":
          "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask":
          FIELD_MASK,
      },

      body: JSON.stringify({
        includedTypes: [
          includedType,
        ],

        maxResultCount: 20,

        rankPreference:
          "DISTANCE",

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
    }
  );

  if (!response.ok) {
    const message =
      await response.text();

    throw new Error(
      `Google Places request failed (${response.status}): ${message}`
    );
  }

  const data =
    (await response.json()) as {
      places?: GooglePlace[];
    };

  return (data.places ?? []).filter(
  (place) =>
    place.businessStatus !==
      "CLOSED_PERMANENTLY" &&
    place.businessStatus !==
      "CLOSED_TEMPORARILY"
);
}

export async function buildShops(
  lat: number,
  lng: number
): Promise<Shop[]> {
  const apiKey =
    process.env
      .EXPO_PUBLIC_GOOGLE_PLACES_API_KEY;

  if (!apiKey) {
    throw new Error(
      "Missing EXPO_PUBLIC_GOOGLE_PLACES_API_KEY"
    );
  }

  const results =
    await Promise.all([
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

  const unique =
    new Map<string, GooglePlace>();

  results.flat().forEach(
    (place) => {
      if (place.id) {
        unique.set(
          place.id,
          place
        );
      }
    }
  );

  return [
    ...unique.values(),
  ]
    .filter(
      (place) =>
        typeof place.location
          ?.latitude ===
          "number" &&
        typeof place.location
          ?.longitude ===
          "number" &&
        !!place.displayName?.text
    )
    .map((place) => {
      const shopLat =
        place.location!.latitude!;

      const shopLng =
        place.location!.longitude!;

      const distKm =
        haversineKm(
          lat,
          lng,
          shopLat,
          shopLng
        );

      const googleRating =
        place.rating ?? 0;

      const reviews =
        place.userRatingCount ?? 0;

      /*
       * Nearest Cup scores start at zero.
       *
       * We do NOT use Google's rating
       * as a substitute for Nearest Cup
       * user data.
       */

      const coffeeQualityScore = 0;
      const consistencyScore = 0;
      const milkDrinksScore = 0;
      const espressoScore = 0;
      const filterScore = 0;

      const coffeeQualityRatings = 0;
      const consistencyRatings = 0;
      const milkDrinksRatings = 0;
      const espressoRatings = 0;
      const filterRatings = 0;

      const nearestCupScore =
        calculateNearestCupScore(
          coffeeQualityScore,
          consistencyScore,
          milkDrinksScore,
          espressoScore,
          filterScore
        );

      const openNow =
        place
          .regularOpeningHours
          ?.openNow ?? false;

      return {
        id: place.id!,

        name:
          place.displayName!
            .text!,

        lat: shopLat,
        lng: shopLng,

        angle: Math.atan2(
          shopLng - lng,
          shopLat - lat
        ),

        distKmRaw: distKm,

        distKm:
          Math.round(
            distKm * 10
          ) / 10,

        mins: Math.max(
          1,
          Math.round(
            (distKm /
              WALK_SPEED_KMH) *
              60
          )
        ),

        // Google data
        googleRating,

        reviews,

        priceLevel:
          priceLevel(
            place.priceLevel
          ),

        address:
          place.formattedAddress,

        website:
          place.websiteUri,

        googleMapsUrl:
          `https://www.google.com/maps/search/?api=1` +
          `&query=${encodeURIComponent(
            place.displayName!
              .text!
          )}` +
          `&query_place_id=${encodeURIComponent(
            place.id!
          )}`,

        // Nearest Cup proprietary data
        coffeeQualityScore,
        consistencyScore,
        milkDrinksScore,
        espressoScore,
        filterScore,

        coffeeQualityRatings,
        consistencyRatings,
        milkDrinksRatings,
        espressoRatings,
        filterRatings,

        nearestCupScore,

        // Compatibility with existing UI
        rating: googleRating,

        recentRating:
          googleRating,

        weightedScore:
          nearestCupScore,

        tags:
          tagsForPlace(place),

        openNow,

        wifi: false,

        hue: hashHue(
          place.displayName!
            .text!
        ),
      } satisfies Shop;
    })
    .sort((a, b) => {
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

export function calculateShopCoffeeScores(
  shopId: string,
  ratings: CoffeeRating[]
) {
  const shopRatings = ratings.filter(
    (rating) => rating.shopId === shopId
  );

  if (shopRatings.length === 0) {
    return {
      coffeeQualityScore: 0,
      consistencyScore: 0,
      milkDrinksScore: 0,
      espressoScore: 0,
      filterScore: 0,
      coffeeQualityRatings: 0,
      consistencyRatings: 0,
      milkDrinksRatings: 0,
      espressoRatings: 0,
      filterRatings: 0,
      nearestCupScore: 0,
    };
  }

  const average = (items: CoffeeRating[]) => {
    if (items.length === 0) return 0;

    const total = items.reduce(
      (sum, item) => sum + item.rating,
      0
    );

    return Math.round(
      (total / items.length) * 10
    ) / 10;
  };

  const milkDrinks = shopRatings.filter(
    (rating) =>
      rating.drinkType === "Flat white" ||
      rating.drinkType === "Cappuccino" ||
      rating.drinkType === "Latte"
  );

  const espresso = shopRatings.filter(
    (rating) => rating.drinkType === "Espresso"
  );

  const filter = shopRatings.filter(
    (rating) => rating.drinkType === "Filter"
  );

  const coffeeQualityScore = average(shopRatings);

const milkDrinksScore = average(milkDrinks);

const espressoScore = average(espresso);

const filterScore = average(filter);

const consistencyRatings = shopRatings.filter(
  (rating) =>
    typeof rating.consistencyRating === "number" &&
    rating.consistencyRating > 0
);

const consistencyScore =
  consistencyRatings.length > 0
    ? Math.round(
        (
          consistencyRatings.reduce(
            (sum, rating) =>
              sum + rating.consistencyRating!,
            0
          ) / consistencyRatings.length
        ) * 10
      ) / 10
    : 0;

  const components = [
  { score: coffeeQualityScore, weight: 0.4 },
  { score: consistencyScore, weight: 0.2 },
  { score: milkDrinksScore, weight: 0.15 },
  { score: espressoScore, weight: 0.15 },
  { score: filterScore, weight: 0.1 },
].filter((component) => component.score > 0);

  const totalWeight = components.reduce(
    (sum, component) => sum + component.weight,
    0
  );

  const weightedScore =
    components.length > 0
      ? components.reduce(
          (sum, component) =>
            sum + component.score * component.weight,
          0
        ) / totalWeight
      : 0;

  return {
    coffeeQualityScore,
    consistencyScore,
    milkDrinksScore,
    espressoScore,
    filterScore,
    coffeeQualityRatings: shopRatings.length,
    consistencyRatings: consistencyRatings.length,
    milkDrinksRatings: milkDrinks.length,
    espressoRatings: espresso.length,
    filterRatings: filter.length,
    nearestCupScore:
      Math.round(weightedScore * 10) / 10,
  };
}

export function filterAndRank(
  shops: Shop[],
  f: Filters,
  coffeeRatings: CoffeeRating[]
): Shop[] {
  return shops
    .filter(
      (s) =>
        s.mins <= f.maxMins
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
      const aScores =
        calculateShopCoffeeScores(
          a.id,
          coffeeRatings
        );

      const bScores =
        calculateShopCoffeeScores(
          b.id,
          coffeeRatings
        );

      const NEUTRAL_SCORE = 3.5;
      const CONFIDENCE_WEIGHT = 5;

      const aAdjustedScore =
        aScores.coffeeQualityRatings > 0
          ? (
              aScores.nearestCupScore *
                aScores.coffeeQualityRatings +
              NEUTRAL_SCORE *
                CONFIDENCE_WEIGHT
            ) /
            (
              aScores.coffeeQualityRatings +
              CONFIDENCE_WEIGHT
            )
          : 0;

      const bAdjustedScore =
        bScores.coffeeQualityRatings > 0
          ? (
              bScores.nearestCupScore *
                bScores.coffeeQualityRatings +
              NEUTRAL_SCORE *
                CONFIDENCE_WEIGHT
            ) /
            (
              bScores.coffeeQualityRatings +
              CONFIDENCE_WEIGHT
            )
          : 0;

      const aHasNearestCup =
        aScores.coffeeQualityRatings > 0;

      const bHasNearestCup =
        bScores.coffeeQualityRatings > 0;

      if (
        aHasNearestCup !==
        bHasNearestCup
      ) {
        return aHasNearestCup ? -1 : 1;
      }

      if (
        bAdjustedScore !==
        aAdjustedScore
      ) {
        return (
          bAdjustedScore -
          aAdjustedScore
        );
      }

      const aGoogleScore =
        a.googleRating +
        (Math.min(a.reviews, 500) / 500) *
          0.2;

      const bGoogleScore =
        b.googleRating +
        (Math.min(b.reviews, 500) / 500) *
          0.2;

      if (
        bGoogleScore !==
        aGoogleScore
      ) {
        return (
          bGoogleScore -
          aGoogleScore
        );
      }

      return b.reviews - a.reviews;
    });
}

export function starString(
  rating: number
) {
  const full =
    Math.round(rating);

  return (
    "★".repeat(full) +
    "☆".repeat(
      5 - full
    )
  );
}