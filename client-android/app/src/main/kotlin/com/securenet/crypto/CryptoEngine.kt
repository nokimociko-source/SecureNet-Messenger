package com.securenet.crypto

import android.util.Base64
import java.security.KeyPair
import java.security.KeyPairGenerator
import java.security.PrivateKey
import java.security.PublicKey
import java.security.spec.ECGenParameterSpec
import javax.crypto.Cipher
import javax.crypto.KeyAgreement
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

/**
 * Android Crypto Engine
 * Handles E2EE, Key Storage in Android Keystore, and Double Ratchet.
 */
class CryptoEngine {

    /**
     * Generate Identity Keys (ECDH P-521)
     * Replaces old RSA-4096 for compatibility with Web/Signal protocol.
     */
    fun generateIdentityKeys(): KeyPair {
        val kpg = KeyPairGenerator.getInstance("EC")
        val ecSpec = ECGenParameterSpec("secp521r1")
        kpg.initialize(ecSpec)
        return kpg.generateKeyPair()
    }

    /**
     * Derive Shared Secret using ECDH
     */
    fun deriveSharedSecret(privateKey: PrivateKey, remotePublicKey: PublicKey): ByteArray {
        val ka = KeyAgreement.getInstance("ECDH")
        ka.init(privateKey)
        ka.doPhase(remotePublicKey, true)
        return ka.generateSecret()
    }

    /**
     * Double Ratchet Logic (Skeleton)
     * TODO: Implement KDF and Chain Ratchet as seen in ratchet.ts
     */
    fun performRatchetStep(rootKey: ByteArray, sharedSecret: ByteArray) {
        // Implementation must match kdfRootKey in ratchet.ts
    }

    fun encryptMessage(plaintext: String, secretKey: ByteArray): Map<String, String> {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        val keySpec = SecretKeySpec(secretKey.sliceArray(0..31), "AES")
        cipher.init(Cipher.ENCRYPT_MODE, keySpec)
        
        val iv = cipher.iv
        val ciphertext = cipher.doFinal(plaintext.toByteArray())
        
        return mapOf(
            "ciphertext" to Base64.encodeToString(ciphertext, Base64.NO_WRAP),
            "iv" to Base64.encodeToString(iv, Base64.NO_WRAP)
        )
    }

    fun decryptMessage(ciphertextBase64: String, ivBase64: String, secretKey: ByteArray): String {
        val ciphertext = Base64.decode(ciphertextBase64, Base64.NO_WRAP)
        val iv = Base64.decode(ivBase64, Base64.NO_WRAP)
        
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        val keySpec = SecretKeySpec(secretKey.sliceArray(0..31), "AES")
        val gcmSpec = GCMParameterSpec(128, iv)
        cipher.init(Cipher.DECRYPT_MODE, keySpec, gcmSpec)
        
        return String(cipher.doFinal(ciphertext))
    }
}
