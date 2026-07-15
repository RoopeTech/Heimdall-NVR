package com.example.heimdallnvr.ui

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import coil3.request.ImageRequest
import coil3.request.crossfade
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.layout.ContentScale
import com.example.heimdallnvr.data.Camera
import com.example.heimdallnvr.api.NvrApi
import com.example.heimdallnvr.data.PtzRequest
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LiveViewScreen(
    camera: Camera,
    serverUrl: String,
    apiToken: String,
    onBack: () -> Unit
) {
    val coroutineScope = rememberCoroutineScope()
    val api = remember { NvrApi.create(serverUrl) }
    var actionMessage by remember { mutableStateOf<String?>(null) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(camera.name) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Text("<-")
                    }
                }
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .padding(padding)
                .fillMaxSize()
        ) {
            // Video Player Area (Using MJPEG/Snapshot fallback for V1)
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .aspectRatio(16f / 9f)
            ) {
                val snapshotUrl = "$serverUrl/api/cameras/${camera.id}/snapshot"
                AsyncImage(
                    model = ImageRequest.Builder(LocalContext.current)
                        .data(snapshotUrl)
                        .addHeader("Authorization", "Bearer $apiToken")
                        .crossfade(true)
                        .build(),
                    contentDescription = camera.name,
                    contentScale = ContentScale.Fit,
                    modifier = Modifier.fillMaxSize()
                )
            }

            Spacer(modifier = Modifier.height(16.dp))

            if (actionMessage != null) {
                Text(
                    text = actionMessage!!,
                    color = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.padding(16.dp)
                )
            }

            // Controls
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceEvenly
            ) {
                Button(onClick = {
                    coroutineScope.launch {
                        try {
                            api.ptzControl("Bearer $apiToken", camera.id, PtzRequest("move", pan = -1f))
                            actionMessage = "Moved Left"
                        } catch (e: Exception) {
                            actionMessage = "Error: ${e.message}"
                        }
                    }
                }) {
                    Text("Left")
                }

                Button(onClick = {
                    coroutineScope.launch {
                        try {
                            api.ptzControl("Bearer $apiToken", camera.id, PtzRequest("move", pan = 1f))
                            actionMessage = "Moved Right"
                        } catch (e: Exception) {
                            actionMessage = "Error: ${e.message}"
                        }
                    }
                }) {
                    Text("Right")
                }
            }
            
            Spacer(modifier = Modifier.height(32.dp))

            Button(
                onClick = {
                    coroutineScope.launch {
                        try {
                            api.triggerManualRecord("Bearer $apiToken", camera.id)
                            actionMessage = "Manual Recording Started (15s)"
                        } catch (e: Exception) {
                            actionMessage = "Error: ${e.message}"
                        }
                    }
                },
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp),
                colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error)
            ) {
                Text("⏺ Record 15s Clip")
            }
        }
    }
}
