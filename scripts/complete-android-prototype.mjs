#!/usr/bin/env node
/**
 * Completa estrutura Android HermesVoice no projeto protótipo do usuário.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const PROJECT_ID = process.env.SMOKE_PROJECT_ID ?? "27d4fd0c-9783-44ac-9446-70bd931620ac";

function loadEnv() {
  const path = resolve(process.cwd(), ".env.local");
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    const key = t.slice(0, i);
    let val = t.slice(i + 1);
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnv();

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

const NETWORK_MODULE = `package com.hermesvoice.app.di

import com.hermesvoice.app.network.HermesApiService
import com.squareup.moshi.Moshi
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.adapter.rxjava3.RxJava3CallAdapterFactory
import retrofit2.converter.moshi.MoshiConverterFactory
import java.util.concurrent.TimeUnit
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object NetworkModule {

    @Provides
    @Singleton
    fun provideMoshi(): Moshi =
        Moshi.Builder().add(KotlinJsonAdapterFactory()).build()

    @Provides
    @Singleton
    fun provideOkHttpClient(): OkHttpClient {
        val logging = HttpLoggingInterceptor().apply {
            level = HttpLoggingInterceptor.Level.BASIC
        }
        return OkHttpClient.Builder()
            .addInterceptor(logging)
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(60, TimeUnit.SECONDS)
            .writeTimeout(60, TimeUnit.SECONDS)
            .build()
    }

    @Provides
    @Singleton
    fun provideRetrofit(okHttpClient: OkHttpClient, moshi: Moshi): Retrofit =
        Retrofit.Builder()
            .baseUrl("https://api.hermes.example.com/")
            .client(okHttpClient)
            .addConverterFactory(MoshiConverterFactory.create(moshi))
            .addCallAdapterFactory(RxJava3CallAdapterFactory.create())
            .build()

    @Provides
    @Singleton
    fun provideHermesApiService(retrofit: Retrofit): HermesApiService =
        retrofit.create(HermesApiService::class.java)
}
`;

const DATABASE_MODULE = `package com.hermesvoice.app.di

import android.content.Context
import com.hermesvoice.app.data.local.AppDatabase
import com.hermesvoice.app.data.local.ConversationDao
import com.hermesvoice.app.data.local.MessageDao
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object DatabaseModule {

    @Provides
    @Singleton
    fun provideDatabase(@ApplicationContext context: Context): AppDatabase =
        AppDatabase.getInstance(context)

    @Provides
    @Singleton
    fun provideConversationDao(database: AppDatabase): ConversationDao =
        database.conversationDao()

    @Provides
    @Singleton
    fun provideMessageDao(database: AppDatabase): MessageDao =
        database.messageDao()
}
`;

const ENTITIES = `package com.hermesvoice.app.data.local

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "conversations")
data class ConversationEntity(
    @PrimaryKey val id: String,
    val title: String,
    val createdAt: Long,
)

@Entity(tableName = "messages")
data class MessageEntity(
    @PrimaryKey val id: String,
    val conversationId: String,
    val role: String,
    val content: String,
    val timestamp: Long,
    val audioUrl: String? = null,
)
`;

const DAOS = `package com.hermesvoice.app.data.local

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query

@Dao
interface ConversationDao {
    @Query("SELECT * FROM conversations ORDER BY createdAt DESC")
    suspend fun getAll(): List<ConversationEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(conversation: ConversationEntity)
}

@Dao
interface MessageDao {
    @Query("SELECT * FROM messages WHERE conversationId = :conversationId ORDER BY timestamp ASC")
    suspend fun getByConversation(conversationId: String): List<MessageEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(message: MessageEntity)
}
`;

const APP_DATABASE = `package com.hermesvoice.app.data.local

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase

@Database(
    entities = [ConversationEntity::class, MessageEntity::class],
    version = 1,
    exportSchema = false,
)
abstract class AppDatabase : RoomDatabase() {
    abstract fun conversationDao(): ConversationDao
    abstract fun messageDao(): MessageDao

    companion object {
        @Volatile private var instance: AppDatabase? = null

        fun getInstance(context: Context): AppDatabase =
            instance ?: synchronized(this) {
                instance ?: Room.databaseBuilder(
                    context.applicationContext,
                    AppDatabase::class.java,
                    "hermes_voice.db",
                ).fallbackToDestructiveMigration().build().also { instance = it }
            }
    }
}
`;

const MAIN_ACTIVITY = `package com.hermesvoice.app

import android.Manifest
import android.content.pm.PackageManager
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import com.hermesvoice.app.ui.theme.HermesVoiceTheme
import dagger.hilt.android.AndroidEntryPoint

@AndroidEntryPoint
class MainActivity : ComponentActivity() {

    private var micGranted by mutableStateOf(false)

    private val micPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { granted -> micGranted = granted }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        micGranted = ContextCompat.checkSelfPermission(
            this, Manifest.permission.RECORD_AUDIO,
        ) == PackageManager.PERMISSION_GRANTED

        setContent {
            HermesVoiceTheme {
                Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
                    HermesVoiceScreen(
                        micGranted = micGranted,
                        onRequestMic = { micPermissionLauncher.launch(Manifest.permission.RECORD_AUDIO) },
                    )
                }
            }
        }
    }
}

@Composable
private fun HermesVoiceScreen(micGranted: Boolean, onRequestMic: () -> Unit) {
    var recording by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text("HermesVoice", style = MaterialTheme.typography.headlineMedium)
        Text(
            if (recording) "Gravando áudio…" else "Toque para falar com o assistente",
            modifier = Modifier.padding(vertical = 16.dp),
        )
        if (!micGranted) {
            Button(onClick = onRequestMic) { Text("Permitir microfone") }
        } else {
            Button(onClick = { recording = !recording }) {
                Text(if (recording) "Parar" else "Gravar")
            }
        }
    }
}
`;

const AUDIO_SERVICE = `package com.hermesvoice.app.audio

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import com.hermesvoice.app.R

class AudioRecordingService : Service() {

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val channelId = "hermes_voice_recording"
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                channelId, "Gravação de voz", NotificationManager.IMPORTANCE_LOW,
            )
            getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
        }
        val notification: Notification = NotificationCompat.Builder(this, channelId)
            .setContentTitle("HermesVoice")
            .setContentText("Gravando áudio…")
            .setSmallIcon(R.drawable.ic_mic)
            .setOngoing(true)
            .build()
        startForeground(1, notification)
        return START_STICKY
    }

    override fun onDestroy() {
        stopForeground(STOP_FOREGROUND_REMOVE)
        super.onDestroy()
    }
}
`;

const THEME_KT = `package com.hermesvoice.app.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val LightColors = lightColorScheme(
    primary = Color(0xFF1B4D3E),
    secondary = Color(0xFF2E7D67),
    background = Color(0xFFF4F7F5),
)

@Composable
fun HermesVoiceTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = LightColors, content = content)
}
`;

const FILES = {
  "app/src/main/java/com/hermesvoice/app/di/NetworkModule.kt": NETWORK_MODULE,
  "app/src/main/java/com/hermesvoice/app/di/DatabaseModule.kt": DATABASE_MODULE,
  "app/src/main/java/com/hermesvoice/app/data/local/Entities.kt": ENTITIES,
  "app/src/main/java/com/hermesvoice/app/data/local/Daos.kt": DAOS,
  "app/src/main/java/com/hermesvoice/app/data/local/AppDatabase.kt": APP_DATABASE,
  "app/src/main/java/com/hermesvoice/app/MainActivity.kt": MAIN_ACTIVITY,
  "app/src/main/java/com/hermesvoice/app/audio/AudioRecordingService.kt": AUDIO_SERVICE,
  "app/src/main/java/com/hermesvoice/app/ui/theme/Theme.kt": THEME_KT,
  "app/src/main/res/values/strings.xml": `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name">HermesVoice</string>
</resources>
`,
  "app/src/main/res/values/themes.xml": `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <style name="Theme.HermesVoiceApp" parent="android:Theme.Material.Light.NoActionBar" />
</resources>
`,
  "app/src/main/res/drawable/ic_mic.xml": `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp"
    android:height="24dp"
    android:viewportWidth="24"
    android:viewportHeight="24">
    <path
        android:fillColor="#1B4D3E"
        android:pathData="M12,14c1.66,0 3,-1.34 3,-3V5c0,-1.66 -1.34,-3 -3,-3S9,3.34 9,5v6C9,12.66 10.34,14 12,14z M17.3,11c0,3 -2.54,5.1 -5.3,5.1S6.7,14 6.7,11H5c0,3.41 2.72,6.23 6,6.72V21h2v-3.28c3.28,-0.48 6,-3.3 6,-6.72H17.3z" />
</vector>
`,
  "app/src/main/res/xml/data_extraction_rules.xml": `<?xml version="1.0" encoding="utf-8"?>
<data-extraction-rules>
    <cloud-backup />
</data-extraction-rules>
`,
  "app/src/main/res/xml/backup_rules.xml": `<?xml version="1.0" encoding="utf-8"?>
<full-backup-content />
`,
  "app/proguard-rules.pro": `# HermesVoice — regras mínimas
`,
  "gradle.properties": `org.gradle.jvmargs=-Xmx2048m -Dfile.encoding=UTF-8
android.useAndroidX=true
kotlin.code.style=official
android.nonTransitiveRClass=true
`,
};

const MANIFEST = `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    xmlns:tools="http://schemas.android.com/tools">

    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.RECORD_AUDIO" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE_MICROPHONE" />
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
    <uses-permission android:name="android.permission.WAKE_LOCK" />

    <uses-feature android:name="android.hardware.microphone" android:required="true" />

    <application
        android:name=".HermesVoiceApplication"
        android:allowBackup="true"
        android:dataExtractionRules="@xml/data_extraction_rules"
        android:fullBackupContent="@xml/backup_rules"
        android:icon="@drawable/ic_mic"
        android:label="@string/app_name"
        android:roundIcon="@drawable/ic_mic"
        android:supportsRtl="true"
        android:theme="@style/Theme.HermesVoiceApp"
        tools:targetApi="31">

        <activity
            android:name=".MainActivity"
            android:exported="true"
            android:launchMode="singleTop"
            android:theme="@style/Theme.HermesVoiceApp"
            android:windowSoftInputMode="adjustResize">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>

        <service
            android:name=".audio.AudioRecordingService"
            android:foregroundServiceType="microphone"
            android:exported="false" />
    </application>
</manifest>
`;

const APP_BUILD_GRADLE = `plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("com.google.dagger.hilt.android")
    id("kotlin-kapt")
}

android {
    namespace = "com.hermesvoice.app"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.hermesvoice.app"
        minSdk = 24
        targetSdk = 34
        versionCode = 1
        versionName = "1.0.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    buildFeatures {
        compose = true
    }
    composeOptions {
        kotlinCompilerExtensionVersion = "1.5.11"
    }
    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }
}

dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2024.02.00")
    implementation(composeBom)
    androidTestImplementation(composeBom)

    implementation("androidx.core:core-ktx:1.12.0")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.7.0")
    implementation("androidx.activity:activity-compose:1.8.2")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")

    implementation("com.google.dagger:hilt-android:2.48")
    kapt("com.google.dagger:hilt-compiler:2.48")

    implementation("androidx.room:room-runtime:2.6.1")
    implementation("androidx.room:room-ktx:2.6.1")
    kapt("androidx.room:room-compiler:2.6.1")

    implementation("com.squareup.retrofit2:retrofit:2.9.0")
    implementation("com.squareup.retrofit2:converter-moshi:2.9.0")
    implementation("com.squareup.retrofit2:adapter-rxjava3:2.9.0")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("com.squareup.okhttp3:logging-interceptor:4.12.0")
    implementation("com.squareup.moshi:moshi-kotlin:1.15.1")
    kapt("com.squareup.moshi:moshi-kotlin-codegen:1.15.1")
    implementation("io.reactivex.rxjava3:rxjava:3.1.8")

    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.7.3")

    testImplementation("junit:junit:4.13.2")
    androidTestImplementation("androidx.test.ext:junit:1.1.5")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.5.1")
    debugImplementation("androidx.compose.ui:ui-tooling")
    debugImplementation("androidx.compose.ui:ui-test-manifest")
}

kapt {
    correctErrorTypes = true
}
`;

FILES["app/src/main/AndroidManifest.xml"] = MANIFEST;
FILES["app/build.gradle.kts"] = APP_BUILD_GRADLE;

async function upsert(path, content) {
  const getRes = await fetch(
    `${url}/rest/v1/project_files?select=id&project_id=eq.${PROJECT_ID}&path=eq.${encodeURIComponent(path)}`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } },
  );
  const existing = await getRes.json();
  if (existing?.[0]?.id) {
    const res = await fetch(`${url}/rest/v1/project_files?id=eq.${existing[0].id}`, {
      method: "PATCH",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ content, updated_at: new Date().toISOString() }),
    });
    if (!res.ok) throw new Error(`patch ${path}: ${res.status} ${await res.text()}`);
    return;
  }
  const res = await fetch(`${url}/rest/v1/project_files`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ project_id: PROJECT_ID, path, content }),
  });
  if (!res.ok) {
    throw new Error(`insert ${path}: ${res.status} ${(await res.text()).slice(0, 200)}`);
  }
}

async function updateProjectMeta() {
  const cur = await fetch(`${url}/rest/v1/projects?select=meta&id=eq.${PROJECT_ID}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  const [row] = await cur.json();
  const prev = row?.meta ?? {};
  const res = await fetch(`${url}/rest/v1/projects?id=eq.${PROJECT_ID}`, {
    method: "PATCH",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({
      meta: {
        ...prev,
        stackKind: "mixed",
        stackLabel: "Vite + React + Android Kotlin (HermesVoice)",
        stackReason: "Protótipo full-stack: web FORGE + app de voz Android nativo.",
      },
    }),
  });
  if (!res.ok) throw new Error(`meta patch: ${await res.text()}`);
}

async function main() {
  console.log(`Completing Android prototype ${PROJECT_ID.slice(0, 8)}…`);
  let n = 0;
  for (const [path, content] of Object.entries(FILES)) {
    await upsert(path, content);
    n++;
    console.log(`  ✓ ${path}`);
  }
  await updateProjectMeta();
  console.log(`\nDone: ${n} files upserted + project meta updated.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});