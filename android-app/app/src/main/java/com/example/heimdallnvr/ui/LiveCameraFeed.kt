package com.example.heimdallnvr.ui

import android.graphics.BitmapFactory
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Box
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import com.example.heimdallnvr.api.sharedOkHttpClient
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.withContext
import okhttp3.Request
import kotlin.math.min

@Composable
fun LiveCameraFeed(
    serverUrl: String,
    cameraId: Int,
    apiToken: String,
    pollIntervalMs: Long = 500L,
    highQuality: Boolean = false,
    contentScale: ContentScale = ContentScale.Fit,
    modifier: Modifier = Modifier
) {
    var bitmap by remember { mutableStateOf<ImageBitmap?>(null) }
    var hasError by remember { mutableStateOf(false) }

    LaunchedEffect(serverUrl, cameraId, apiToken, pollIntervalMs, highQuality) {
        val profile = if (highQuality) "hd" else "sd"
        val snapshotUrl = "$serverUrl/api/cameras/$cameraId/snapshot?profile=$profile"
        withContext(Dispatchers.IO) {
            var consecutiveErrors = 0
            while (isActive) {
                val startMs = System.currentTimeMillis()
                try {
                    val request = Request.Builder()
                        .url(snapshotUrl)
                        .addHeader("Authorization", "Bearer $apiToken")
                        .build()
                    val response = sharedOkHttpClient.newCall(request).execute()
                    if (response.isSuccessful) {
                        val bytes = response.body?.bytes()
                        if (bytes != null) {
                            val decoded = BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
                            if (decoded != null) {
                                val imageBitmap = decoded.asImageBitmap()
                                withContext(Dispatchers.Main) {
                                    bitmap = imageBitmap
                                    hasError = false
                                    consecutiveErrors = 0
                                }
                            }
                        }
                    } else {
                        consecutiveErrors++
                        withContext(Dispatchers.Main) { hasError = consecutiveErrors >= 3 }
                    }
                    response.close()
                } catch (e: Exception) {
                    consecutiveErrors++
                    withContext(Dispatchers.Main) { hasError = consecutiveErrors >= 3 }
                }
                // Subtract elapsed time so we target the intended interval;
                // back off exponentially on repeated errors (up to 8x interval)
                val elapsed = System.currentTimeMillis() - startMs
                val backoff = if (consecutiveErrors > 0)
                    min(pollIntervalMs * (1L shl min(consecutiveErrors, 3)), pollIntervalMs * 8)
                else pollIntervalMs
                val remaining = backoff - elapsed
                if (remaining > 0) delay(remaining)
            }
        }
    }

    Box(modifier = modifier) {
        if (bitmap != null) {
            Image(
                bitmap = bitmap!!,
                contentDescription = "Camera Feed",
                contentScale = contentScale,
                modifier = Modifier.matchParentSize()
            )
        } else if (hasError) {
            Text("Offline", modifier = Modifier.align(Alignment.Center))
        } else {
            Text("Connecting…", modifier = Modifier.align(Alignment.Center))
        }
    }
}
