package com.securenet.api

import okhttp3.*
import okio.ByteString
import org.json.JSONObject
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import java.util.concurrent.TimeUnit

/**
 * Secure WebSocket Client for Android
 * Implements one-time ticket authentication and real-time message handling.
 */
class SecureWebSocketClient(private val token: String) {
    private var client: OkHttpClient = OkHttpClient.Builder()
        .readTimeout(0, TimeUnit.MILLISECONDS)
        .build()
    
    private var webSocket: WebSocket? = null

    fun connect(url: String, listener: WebSocketListener) {
        // Backend requires one-time ticket: POST /ws-ticket (Bearer JWT) -> ws?ticket=...
        val httpBase = when {
            url.startsWith("wss://") -> "https://${url.removePrefix("wss://").trimEnd('/')}"
            url.startsWith("ws://") -> "http://${url.removePrefix("ws://").trimEnd('/')}"
            else -> url.trimEnd('/')
        }
        val wsBase = when {
            url.startsWith("https://") -> "wss://${url.removePrefix("https://").trimEnd('/')}"
            url.startsWith("http://") -> "ws://${url.removePrefix("http://").trimEnd('/')}"
            else -> url.trimEnd('/')
        }

        val ticketRequest = Request.Builder()
            .url("$httpBase/ws-ticket")
            .post("{}".toRequestBody("application/json; charset=utf-8".toMediaType()))
            .addHeader("Authorization", "Bearer $token")
            .build()

        client.newCall(ticketRequest).enqueue(object : Callback {
            override fun onFailure(call: Call, e: java.io.IOException) {
                listener.onFailure(webSocket ?: DummyWebSocket(), e, null)
            }

            override fun onResponse(call: Call, response: Response) {
                if (!response.isSuccessful) {
                    listener.onFailure(webSocket ?: DummyWebSocket(), RuntimeException("Ticket request failed: ${response.code}"), response)
                    return
                }

                val body = response.body?.string().orEmpty()
                val ticket = runCatching { JSONObject(body).getString("ticket") }.getOrNull()
                if (ticket.isNullOrBlank()) {
                    listener.onFailure(webSocket ?: DummyWebSocket(), RuntimeException("Invalid ticket response"), response)
                    return
                }

                val wsRequest = Request.Builder()
                    .url("$wsBase/ws?ticket=$ticket")
                    .build()
                webSocket = client.newWebSocket(wsRequest, listener)
            }
        })
    }

    fun sendMessage(text: String) {
        webSocket?.send(text)
    }

    fun disconnect() {
        webSocket?.close(1000, "Goodbye")
    }
}

private class DummyWebSocket : WebSocket {
    override fun request(): Request = Request.Builder().url("http://localhost").build()
    override fun queueSize(): Long = 0
    override fun send(text: String): Boolean = false
    override fun send(bytes: ByteString): Boolean = false
    override fun close(code: Int, reason: String?): Boolean = true
    override fun cancel() {}
}

// Example Listener for handling events
abstract class SecureNetWSListener : WebSocketListener() {
    override fun onOpen(webSocket: WebSocket, response: Response) {
        println("🔌 Android: WebSocket Connected")
    }

    override fun onMessage(webSocket: WebSocket, text: String) {
        println("📨 Android: Received: $text")
    }

    override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
        println("❌ Android: Connection Failed: ${t.message}")
    }
}
