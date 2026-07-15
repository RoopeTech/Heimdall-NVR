package com.example.heimdallnvr.ui

import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.example.heimdallnvr.data.Camera
import com.example.heimdallnvr.api.NvrApi
import com.example.heimdallnvr.data.PtzRequest
import com.example.heimdallnvr.theme.*
import kotlinx.coroutines.delay
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
    var isMoving by remember { mutableStateOf(false) }
    
    // Immersive layout: no scaffold top bar, everything full screen
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black)
    ) {
        // Video Player Area
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .aspectRatio(16f / 9f)
                .align(Alignment.Center)
        ) {
            LiveCameraFeed(
                serverUrl = serverUrl,
                cameraId = camera.id,
                apiToken = apiToken,
                pollIntervalMs = 500L, // 0.5s for live view
                contentScale = ContentScale.Fit,
                modifier = Modifier.fillMaxSize()
            )
            
            // Status Indicator in the corner of video
            Row(
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .padding(16.dp)
                    .clip(CircleShape)
                    .background(GlassDark)
                    .padding(horizontal = 12.dp, vertical = 6.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                val infiniteTransition = rememberInfiniteTransition(label = "pulse")
                val alpha by infiniteTransition.animateFloat(
                    initialValue = 0.4f,
                    targetValue = 1f,
                    animationSpec = infiniteRepeatable(
                        animation = tween(1000, easing = LinearEasing),
                        repeatMode = RepeatMode.Reverse
                    ),
                    label = "alpha"
                )

                Box(
                    modifier = Modifier
                        .size(8.dp)
                        .clip(CircleShape)
                        .background(StatusLive.copy(alpha = alpha))
                )
                Spacer(modifier = Modifier.width(6.dp))
                Text(
                    text = "LIVE",
                    style = MaterialTheme.typography.labelSmall,
                    color = Color.White,
                    fontWeight = FontWeight.Bold
                )
            }
        }
        
        // Floating Back Button (Glassmorphism)
        IconButton(
            onClick = onBack,
            modifier = Modifier
                .align(Alignment.TopStart)
                .padding(top = 48.dp, start = 16.dp)
                .size(48.dp)
                .clip(CircleShape)
                .background(GlassLight)
        ) {
            Icon(
                imageVector = Icons.Default.ArrowBack,
                contentDescription = "Back",
                tint = Color.White
            )
        }

        // Floating Title
        Text(
            text = camera.name,
            style = MaterialTheme.typography.titleLarge,
            color = Color.White,
            fontWeight = FontWeight.Bold,
            modifier = Modifier
                .align(Alignment.TopCenter)
                .padding(top = 56.dp)
        )

        // PTZ Controls Area (Bottom)
        if (camera.ptz_capabilities.isNotEmpty()) {
            Box(
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .fillMaxWidth()
                    .padding(32.dp)
            ) {
                Row(
                    modifier = Modifier
                        .align(Alignment.Center)
                        .clip(RoundedCornerShape(32.dp))
                        .background(GlassDark)
                        .padding(8.dp),
                    horizontalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    if (camera.ptz_capabilities.contains("pan")) {
                        PtzButton(
                            text = "LEFT",
                            isMoving = isMoving,
                            onClick = {
                                coroutineScope.launch {
                                    isMoving = true
                                    try {
                                        NvrApi.create(serverUrl, apiToken)
                                            .ptzMove(camera.id, PtzRequest("left"))
                                    } catch(e: Exception) {}
                                    delay(500)
                                    try {
                                        NvrApi.create(serverUrl, apiToken)
                                            .ptzMove(camera.id, PtzRequest("stop"))
                                    } catch(e: Exception) {}
                                    isMoving = false
                                }
                            }
                        )
                        PtzButton(
                            text = "RIGHT",
                            isMoving = isMoving,
                            onClick = {
                                coroutineScope.launch {
                                    isMoving = true
                                    try {
                                        NvrApi.create(serverUrl, apiToken)
                                            .ptzMove(camera.id, PtzRequest("right"))
                                    } catch(e: Exception) {}
                                    delay(500)
                                    try {
                                        NvrApi.create(serverUrl, apiToken)
                                            .ptzMove(camera.id, PtzRequest("stop"))
                                    } catch(e: Exception) {}
                                    isMoving = false
                                }
                            }
                        )
                    }
                    if (camera.ptz_capabilities.contains("tilt")) {
                        PtzButton(
                            text = "UP",
                            isMoving = isMoving,
                            onClick = {
                                coroutineScope.launch {
                                    isMoving = true
                                    try {
                                        NvrApi.create(serverUrl, apiToken)
                                            .ptzMove(camera.id, PtzRequest("up"))
                                    } catch(e: Exception) {}
                                    delay(500)
                                    try {
                                        NvrApi.create(serverUrl, apiToken)
                                            .ptzMove(camera.id, PtzRequest("stop"))
                                    } catch(e: Exception) {}
                                    isMoving = false
                                }
                            }
                        )
                        PtzButton(
                            text = "DOWN",
                            isMoving = isMoving,
                            onClick = {
                                coroutineScope.launch {
                                    isMoving = true
                                    try {
                                        NvrApi.create(serverUrl, apiToken)
                                            .ptzMove(camera.id, PtzRequest("down"))
                                    } catch(e: Exception) {}
                                    delay(500)
                                    try {
                                        NvrApi.create(serverUrl, apiToken)
                                            .ptzMove(camera.id, PtzRequest("stop"))
                                    } catch(e: Exception) {}
                                    isMoving = false
                                }
                            }
                        )
                    }
                }
            }
        }
    }
}

@Composable
fun PtzButton(
    text: String,
    isMoving: Boolean,
    onClick: () -> Unit
) {
    Button(
        onClick = onClick,
        enabled = !isMoving,
        colors = ButtonDefaults.buttonColors(
            containerColor = GlassLight,
            contentColor = NeonOrange
        ),
        shape = CircleShape
    ) {
        Text(text, fontWeight = FontWeight.Bold)
    }
}
