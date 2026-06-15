// app.config.ts — Expo dynamic config
//
// Problem: @rnmapbox/maps Expo plugin only patches android/build.gradle when it's
// Groovy DSL. Expo SDK 56+ uses Kotlin DSL (.kts), so the plugin prints a warning
// and skips adding the Mapbox Maven repo. Gradle then falls back to JitPack which
// times out fetching com.mapbox.maps:android-ndk27.
//
// Fix: custom withDangerousMod that adds the Mapbox Maven repo to whichever
// .kts or .groovy build files exist after expo prebuild runs.

import { withDangerousMod } from "expo/config-plugins";
import * as fs from "fs";
import * as path from "path";

const MAPBOX_MAVEN = "https://api.mapbox.com/downloads/v2/releases/maven";

const withMapboxMavenRepo = (config: Record<string, unknown>): Record<string, unknown> =>
  withDangerousMod(config as any, [
    "android",
    async (c: any) => {
      const androidRoot: string = c.modRequest.platformProjectRoot;

      const candidates = [
        { file: path.join(androidRoot, "build.gradle.kts"), isKts: true },
        { file: path.join(androidRoot, "build.gradle"), isKts: false },
        { file: path.join(androidRoot, "settings.gradle.kts"), isKts: true },
        { file: path.join(androidRoot, "settings.gradle"), isKts: false },
      ];

      for (const { file, isKts } of candidates) {
        if (!fs.existsSync(file)) continue;

        const src = fs.readFileSync(file, "utf8");
        if (src.includes(MAPBOX_MAVEN)) {
          console.log(`[MapboxMaven] already in ${path.basename(file)}`);
          return c;
        }

        const entry = isKts
          ? `maven { url = uri("${MAPBOX_MAVEN}") }`
          : `maven { url "${MAPBOX_MAVEN}" }`;

        // Try injecting into an existing allprojects { repositories { ... } } block
        const allProjectsRepos = /(allprojects\s*\{[^{]*repositories\s*\{)/s;
        if (allProjectsRepos.test(src)) {
          const patched = src.replace(allProjectsRepos, `$1\n        ${entry}`);
          fs.writeFileSync(file, patched, "utf8");
          console.log(`[MapboxMaven] injected into allprojects.repositories in ${path.basename(file)}`);
          return c;
        }

        // Try dependencyResolutionManagement { repositories { ... } }
        const drm = /(dependencyResolutionManagement\s*\{[^{]*repositories\s*\{)/s;
        if (drm.test(src)) {
          const patched = src.replace(drm, `$1\n        ${entry}`);
          fs.writeFileSync(file, patched, "utf8");
          console.log(`[MapboxMaven] injected into dependencyResolutionManagement.repositories in ${path.basename(file)}`);
          return c;
        }
      }

      // Last resort: append a new allprojects block to build.gradle.kts
      const ktsPath = path.join(androidRoot, "build.gradle.kts");
      if (fs.existsSync(ktsPath)) {
        const existing = fs.readFileSync(ktsPath, "utf8");
        const appended = `${existing}\nallprojects {\n    repositories {\n        maven { url = uri("${MAPBOX_MAVEN}") }\n    }\n}\n`;
        fs.writeFileSync(ktsPath, appended, "utf8");
        console.log("[MapboxMaven] appended allprojects block to build.gradle.kts");
      }

      return c;
    },
  ]) as any;

const baseConfig = ({ config }: { config: Record<string, unknown> }): Record<string, unknown> => ({
  ...config,
  plugins: [
    "expo-router",
    "expo-status-bar",
    "expo-web-browser",
    "@rnmapbox/maps",
  ],
});

export default (args: { config: Record<string, unknown> }) =>
  withMapboxMavenRepo(baseConfig(args));
