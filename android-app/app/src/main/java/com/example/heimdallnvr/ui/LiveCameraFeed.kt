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
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request

val okHttpClient = OkHttpClient()

@Composable
fun LiveCameraFeed(
    serverUrl: String,
    cameraId: Int,
    apiToken: String,
    pollIntervalMs: Long = 500L,
    contentScale: ContentScale = ContentScale.Fit,
    modifier: Modifier = Modifier
) {
    var bitmap by remember { mutableStateOf<ImageBitmap?>(null) }
    var hasError by remember { mutableStateOf(false) }

    LaunchedEffect(serverUrl, cameraId, apiToken, pollIntervalMs) {
        val snapshotUrl = "$serverUrl/api/cameras/$cameraId/snapshot"
        withContext(Dispatchers.IO) {
            while (isActive) {
                try {
                    val request = Request.Builder()
                        .url(snapshotUrl)
                        .addHeader("Authorization", "Bearer $apiToken")
                        .build()

                    val response = okHttpClient.newCall(request).execute()
                    if (response.isSuccessful) {
                        val bytes = response.body?.bytes()
                        if (bytes != null) {
                            val decoded = BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
                            if (decoded != null) {
                                val imageBitmap = decoded.asImageBitmap()
                                withContext(Dispatchers.Main) {
                                    bitmap = imageBitmap
                                    hasError = false
                                }
                            }
                        }
                    } else {
                        withContext(Dispatchers.Main) {
                            hasError = true
                        }
                    }
                    response.close()
                } catch (e: Exception) {
                    withContext(Dispatchers.Main) {
                        hasError = true
                    }
                }
                delay(pollIntervalMs)
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
            Text("Connection Error", modifier = Modifier.align(Alignment.Center))
        } else {
            Text("Loading...", modifier = Modifier.align(Alignment.Center))
        }
    }
}
