package com.securenet.api

import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

data class UpdateInfo(
    val platform: String,
    val version: String,
    val url: String,
    val sha256: String,
    val releaseNotes: String?
)

/**
 * Self-hosted update checker (GitHub Releases / Telegram CDN / any HTTPS asset URL).
 * Works without Google Play.
 */
class UpdateManager(private val apiBaseUrl: String) {

    fun checkAndroidUpdate(currentVersion: String): UpdateInfo? {
        val endpoint = "${apiBaseUrl.trimEnd('/')}/api/updates/latest?platform=android"
        val conn = URL(endpoint).openConnection() as HttpURLConnection
        conn.requestMethod = "GET"
        conn.connectTimeout = 8000
        conn.readTimeout = 8000

        return try {
            if (conn.responseCode != 200) return null
            val body = conn.inputStream.bufferedReader().use { it.readText() }
            val json = JSONObject(body)
            val latestVersion = json.optString("version", "")
            if (latestVersion.isBlank() || latestVersion == currentVersion) return null

            UpdateInfo(
                platform = json.getString("platform"),
                version = latestVersion,
                url = json.getString("url"),
                sha256 = json.getString("sha256"),
                releaseNotes = json.optString("releaseNotes", null)
            )
        } finally {
            conn.disconnect()
        }
    }
}

