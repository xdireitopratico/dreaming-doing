// seeds/android-native.ts — scaffold Gradle/Kotlin mínimo (preview = build log, não iframe Vite)
import type { SeedFile } from "./types";

const SETTINGS_GRADLE = `pluginManagement {
  repositories {
    google()
    mavenCentral()
    gradlePluginPortal()
  }
}
dependencyResolutionManagement {
  repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
  repositories {
    google()
    mavenCentral()
  }
}
rootProject.name = "ForgeAndroid"
include(":app")
`;

const ROOT_BUILD_GRADLE = `plugins {
  id("com.android.application") version "8.7.3" apply false
  id("org.jetbrains.kotlin.android") version "2.0.21" apply false
}
`;

const APP_BUILD_GRADLE = `plugins {
  id("com.android.application")
  id("org.jetbrains.kotlin.android")
}
android {
  namespace = "com.forge.app"
  compileSdk = 35
  defaultConfig {
    applicationId = "com.forge.app"
    minSdk = 26
    targetSdk = 35
    versionCode = 1
    versionName = "1.0"
  }
  buildTypes {
    release {
      isMinifyEnabled = false
    }
  }
  compileOptions {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
  }
  kotlinOptions {
    jvmTarget = "17"
  }
}
dependencies {
  implementation("androidx.core:core-ktx:1.15.0")
  implementation("androidx.appcompat:appcompat:1.7.0")
  implementation("com.google.android.material:material:1.12.0")
}
`;

const MANIFEST = `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
  <application
    android:allowBackup="true"
    android:label="FORGE App"
    android:supportsRtl="true"
    android:theme="@style/Theme.AppCompat.DayNight.NoActionBar">
    <activity
      android:name=".MainActivity"
      android:exported="true">
      <intent-filter>
        <action android:name="android.intent.action.MAIN" />
        <category android:name="android.intent.category.LAUNCHER" />
      </intent-filter>
    </activity>
  </application>
</manifest>
`;

const MAIN_ACTIVITY = `package com.forge.app

import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity

/** Canvas vazio — agente gera UI e lógica Kotlin nas próximas iterações. */
class MainActivity : AppCompatActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    // TODO: agente implementa layout e fluxos do app
  }
}
`;

const GRADLE_PROPERTIES = `org.gradle.jvmargs=-Xmx2048m -Dfile.encoding=UTF-8
android.useAndroidX=true
kotlin.code.style=official
`;

const README = `# FORGE Android Native

Scaffold Kotlin/Gradle — build longo, sem preview iframe Vite.
Acompanhe progresso no chat e na árvore de arquivos.

\`\`\`bash
./gradlew assembleDebug
\`\`\`
`;

export const ANDROID_NATIVE_SEED: SeedFile[] = [
  { path: "settings.gradle.kts", content: SETTINGS_GRADLE },
  { path: "build.gradle.kts", content: ROOT_BUILD_GRADLE },
  { path: "app/build.gradle.kts", content: APP_BUILD_GRADLE },
  { path: "app/src/main/AndroidManifest.xml", content: MANIFEST },
  { path: "app/src/main/java/com/forge/app/MainActivity.kt", content: MAIN_ACTIVITY },
  { path: "gradle.properties", content: GRADLE_PROPERTIES },
  { path: "README.md", content: README },
];
