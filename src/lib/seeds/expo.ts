// seeds/expo.ts — Expo Router + TypeScript (preview web + mobile)
import type { SeedFile } from "./types";

const PACKAGE_JSON = `{
  "name": "forge-expo-app",
  "version": "1.0.0",
  "private": true,
  "main": "expo-router/entry",
  "scripts": {
    "start": "expo start",
    "web": "expo start --web",
    "android": "expo start --android",
    "ios": "expo start --ios"
  },
  "dependencies": {
    "expo": "~52.0.46",
    "expo-constants": "~17.0.8",
    "expo-linking": "~7.0.5",
    "expo-router": "~4.0.21",
    "expo-status-bar": "~2.0.1",
    "react": "18.3.1",
    "react-dom": "18.3.1",
    "react-native": "0.76.9",
    "react-native-safe-area-context": "4.12.0",
    "react-native-screens": "~4.4.0",
    "react-native-web": "~0.19.13"
  },
  "devDependencies": {
    "@babel/core": "^7.25.0",
    "@types/react": "~18.3.12",
    "typescript": "~5.3.3"
  }
}
`;

const APP_JSON = `{
  "expo": {
    "name": "FORGE App",
    "slug": "forge-expo-app",
    "version": "1.0.0",
    "orientation": "portrait",
    "scheme": "forgeapp",
    "userInterfaceStyle": "automatic",
    "web": {
      "bundler": "metro",
      "output": "single"
    },
    "plugins": ["expo-router"]
  }
}
`;

const TSCONFIG = `{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "paths": {
      "@/*": ["./*"]
    }
  },
  "include": ["**/*.ts", "**/*.tsx", ".expo/types/**/*.ts", "expo-env.d.ts"]
}
`;

const BABEL_CONFIG = `module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
  };
};
`;

const LAYOUT = `import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";

export default function RootLayout() {
  return (
    <>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }} />
    </>
  );
}
`;

/** Canvas vazio — agente gera telas em app/ */
const INDEX = `import { StyleSheet, Text, View } from "react-native";

export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>FORGE Expo</Text>
      <Text style={styles.subtitle}>
        Canvas vazio — descreva o app no chat para gerar as telas aqui.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#05060A",
  },
  title: {
    fontSize: 22,
    fontWeight: "600",
    color: "#EDEFF2",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
    color: "#94A3B8",
    maxWidth: 320,
  },
});
`;

const GITIGNORE = `node_modules/
.expo/
dist/
web-build/
*.jks
*.p8
*.p12
*.key
*.mobileprovision
*.orig.*
.env
.env.*
!.env.example
`;

const README = `# FORGE Expo App

Expo Router + TypeScript — preview web no FORGE e QR para Expo Go no celular.

\`\`\`bash
npm install
npm run web
\`\`\`
`;

export const EXPO_SEED: SeedFile[] = [
  { path: "package.json", content: PACKAGE_JSON },
  { path: "app.json", content: APP_JSON },
  { path: "tsconfig.json", content: TSCONFIG },
  { path: "babel.config.js", content: BABEL_CONFIG },
  { path: "app/_layout.tsx", content: LAYOUT },
  { path: "app/index.tsx", content: INDEX },
  { path: ".gitignore", content: GITIGNORE },
  { path: "README.md", content: README },
];
