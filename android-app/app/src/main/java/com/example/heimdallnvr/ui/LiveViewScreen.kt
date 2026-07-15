package com.example.heimdallnvr.ui

import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
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
    }
}
