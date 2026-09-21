module.exports = ({ config }) => ({
  ...config,

  plugins: [
    ...(config.plugins || []).filter(
      (plugin) =>
        plugin !== "react-native-maps" &&
        !(
          Array.isArray(plugin) &&
          plugin[0] === "react-native-maps"
        )
    ),

    [
      "react-native-maps",
      {
        androidGoogleMapsApiKey:
          process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY,
      },
    ],
  ],
});