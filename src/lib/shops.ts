export type Tag = "coffee" | "matcha" | "pastries" | "brunch" | "lunch";

export interface Shop {
  id: string;
  name: string;
  lat: number;
  lng: number;
  angle: number;
  distKmRaw: number;
  distKm: number;
  mins: number;
  rating: number;
  reviews: number;
  recentRating: number;
  weightedScore: number;
  tags: Tag[];
  openNow: boolean;
  priceLevel: 1 | 2 | 3;
  wifi: boolean;
  hue: number;
}

export const ALL_TAGS: Tag[] = ["coffee", "matcha", "pastries", "brunch", "lunch"];
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

const NAMES = [
  "Fumbally Yard", "The Rounded Bean", "Ardent Roasters", "Little Wick Coffee",
  "Sable & Steam", "Monkstown Mill", "Copper Kettle Co.", "Quay Street Grind",
  "The Daily Pour", "Hearth & Husk", "Birchwood Brew", "Nine Stone Roastery",
];

const WALK_SPEED_KMH = 5;

function seededRandom(seed: number) {
  let s = seed;
  return function () {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

function hashHue(str: string) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) % 360;
  return h;
}

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function buildShops(lat: number, lng: number): Shop[] {
  const rand = seededRandom(Math.round((lat + lng) * 100000) || 42);
  const shops: Shop[] = [];
  const count = 9;

  for (let i = 0; i < count; i++) {
    const angle = rand() * Math.PI * 2;
    const distKm = 0.15 + rand() * 1.6;
    const dLat = (distKm / 111) * Math.cos(angle);
    const dLng = (distKm / (111 * Math.cos((lat * Math.PI) / 180))) * Math.sin(angle);

    const rating = Math.min(Math.round((3.6 + rand() * 1.4) * 10) / 10, 5.0);
    const reviews = Math.floor(20 + rand() * 480);
    const trendDelta = Math.round((rand() * 0.8 - 0.4) * 10) / 10;
    const recentRating = Math.max(1, Math.min(5, Math.round((rating + trendDelta) * 10) / 10));
    const weightedScore = Math.round((recentRating * 0.55 + rating * 0.45) * 100) / 100;

    const tags: Tag[] = ["coffee"];
    ALL_TAGS.slice(1).forEach((tag) => {
      if (rand() < 0.42) tags.push(tag);
    });

    const name = NAMES[i % NAMES.length];
    const shopLat = lat + dLat;
    const shopLng = lng + dLng;
    const realDistKm = haversineKm(lat, lng, shopLat, shopLng);

    shops.push({
      id: i + "-" + name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      name,
      lat: shopLat,
      lng: shopLng,
      angle,
      distKmRaw: distKm,
      distKm: realDistKm,
      mins: Math.round((realDistKm / WALK_SPEED_KMH) * 60),
      rating,
      reviews,
      recentRating,
      weightedScore,
      tags,
      openNow: rand() < 0.72,
      priceLevel: (1 + Math.floor(rand() * 3)) as 1 | 2 | 3,
      wifi: rand() < 0.55,
      hue: hashHue(name),
    });
  }

  return shops;
}

export interface Filters {
  maxMins: number;
  activeTags: Set<Tag>;
  requireOpen: boolean;
  favoritesOnly: boolean;
  favorites: Set<string>;
}

export function filterAndRank(shops: Shop[], f: Filters): Shop[] {
  return shops
    .filter((s) => s.mins <= f.maxMins)
    .filter((s) => f.activeTags.size === 0 || s.tags.some((t) => f.activeTags.has(t)))
    .filter((s) => !f.requireOpen || s.openNow)
    .filter((s) => !f.favoritesOnly || f.favorites.has(s.id))
    .sort((a, b) => {
      if (b.weightedScore !== a.weightedScore) return b.weightedScore - a.weightedScore;
      return b.reviews - a.reviews;
    });
}

export function starString(rating: number) {
  const full = Math.round(rating);
  return "★".repeat(full) + "☆".repeat(5 - full);
}