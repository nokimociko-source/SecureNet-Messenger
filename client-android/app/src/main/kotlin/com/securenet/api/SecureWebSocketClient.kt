package com.securenet.api

import okhttp3.*
import okio.ByteString
import java.util.concurrent.TimeUnit

/**
 * Secure WebSocket Client for Android
 * Implements JWT authentication and real-time message handling.
 */
class SecureWebSocketClient(private val token: String) {
    private var client: OkHttpClient = OkHttpClient.Builder()
        .readTimeout(0, TimeUnit.MILLISECONDS)
        .build()
    
    private var webSocket: WebSocket? = null

    fun connect(url: String, listener: WebSocketListener) {
        // ✅ Fix #1: JWT Auth in URL (matching backend requirement)
        val request = Request.Builder()
            .url("$url?token=$token")
            .build()
            
        webSocket = client.newWebSocket(request, listener)
    }

    fun sendMessage(text: String) {
        webSocket?.send(text)
    }

    fun disconnect() {
        webSocket?.close(1000, "Goodbye")
    }
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
