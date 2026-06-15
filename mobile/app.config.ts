import { ExpoConfig, ConfigContext } from "expo/config";
import baseConfig from "./app.json";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...(baseConfig.expo as ExpoConfig),
  ...config,
  plugins: [
    "expo-router",
    "expo-status-bar",
    "expo-web-browser",
    [
      "@rnmapbox/maps",
      {
        // Secret Mapbox Downloads token (sk.eyJ1...) — add via:
        // eas secret:create --scope project --name MAPBOX_DOWNLOAD_TOKEN --value "sk.xxx"
        RNMapboxMapsDownloadToken: process.env.MAPBOX_DOWNLOAD_TOKEN ?? "",
      },
    ],
  ],
});
