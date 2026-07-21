package com.example.heimdallnvr.ui

import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.heimdallnvr.data.Camera
import com.example.heimdallnvr.data.Group
import com.example.heimdallnvr.theme.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CameraGridScreen(
    cameras: List<Camera>,
    groups: List<Group>,
    serverUrl: String,
    apiToken: String,
    error: String?,
    isLoading: Boolean,
    onCameraClick: (Camera) -> Unit,
    onRefresh: () -> Unit,
    modifier: Modifier = Modifier,
    topBar: @Composable () -> Unit = {}
) {
    var activeGroupId by remember { mutableStateOf<Int?>(null) }

    val visibleCameras = remember(cameras, activeGroupId, groups) {
        if (activeGroupId == null) cameras
        else {
            val group = groups.find { it.id == activeGroupId }
            cameras.filter { cam -> group?.cameraIds?.contains(cam.id) == true }
        }
    }

    Column(modifier = modifier.fillMaxSize().background(DarkSlate)) {

        // Group filter chips
        if (groups.isNotEmpty()) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState())
                    .padding(horizontal = 16.dp, vertical = 10.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                // "All" chip
                FilterChip(
                    selected = activeGroupId == null,
                    onClick = { activeGroupId = null },
                    label = { Text("All (${cameras.size})") },
                    colors = FilterChipDefaults.filterChipColors(
                        selectedContainerColor = NeonOrange,
                        selectedLabelColor = Color.Black
                    )
                )
                groups.forEach { group ->
                    FilterChip(
                        selected = activeGroupId == group.id,
                        onClick = { activeGroupId = if (activeGroupId == group.id) null else group.id },
                        label = { Text(group.name) },
                        colors = FilterChipDefaults.filterChipColors(
                            selectedContainerColor = NeonOrange,
                            selectedLabelColor = Color.Black
                        )
                    )
                }
            }
            HorizontalDivider(color = OnDarkSlate.copy(alpha = 0.08f))
        }

        // Content
        Box(modifier = Modifier.fillMaxSize()) {
            when {
                isLoading -> CircularProgressIndicator(
                    modifier = Modifier.align(Alignment.Center),
                    color = NeonOrange
                )
                error != null -> Column(
                    modifier = Modifier.align(Alignment.Center),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text(text = error, color = StatusError)
                    Spacer(Modifier.height(16.dp))
                    OutlinedButton(
                        onClick = onRefresh,
                        colors = ButtonDefaults.outlinedButtonColors(contentColor = NeonOrange)
                    ) {
                        Icon(Icons.Default.Refresh, contentDescription = null)
                        Spacer(Modifier.width(6.dp))
                        Text("Retry")
                    }
                }
                visibleCameras.isEmpty() -> Text(
                    text = if (activeGroupId != null) "No cameras in this group"
                           else "No cameras configured",
                    color = OnDarkSlate.copy(alpha = 0.5f),
                    modifier = Modifier.align(Alignment.Center)
                )
                else -> LazyVerticalGrid(
                    columns = GridCells.Fixed(2),
                    contentPadding = PaddingValues(top = 8.dp, start = 16.dp, end = 16.dp, bottom = 16.dp),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    items(visibleCameras) { camera ->
                        CameraCard(
                            camera = camera,
                            serverUrl = serverUrl,
                            apiToken = apiToken,
                            onClick = { onCameraClick(camera) }
                        )
                    }
                }
            }
        }
    }
}

@Composable
fun CameraCard(
    camera: Camera,
    serverUrl: String,
    apiToken: String,
    onClick: () -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .aspectRatio(16f / 9f)
            .clickable { onClick() },
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = DarkSlateElevated),
        elevation = CardDefaults.cardElevation(defaultElevation = 6.dp)
    ) {
        Box(modifier = Modifier.fillMaxSize()) {
            LiveCameraFeed(
                serverUrl = serverUrl,
                cameraId = camera.id,
                apiToken = apiToken,
                pollIntervalMs = 1000L,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize()
            )

            // Gradient scrim
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(
                        Brush.verticalGradient(
                            colors = listOf(Color.Transparent, ScrimDark),
                            startY = 80f
                        )
                    )
            )

            // Record mode badge (top-right)
            if (!camera.isViewOnly) {
                Surface(
                    modifier = Modifier
                        .align(Alignment.TopEnd)
                        .padding(6.dp),
                    shape = RoundedCornerShape(4.dp),
                    color = when (camera.recordMode) {
                        "always"  -> StatusError.copy(alpha = 0.85f)
                        "hybrid"  -> NeonOrange.copy(alpha = 0.85f)
                        "motion"  -> Color(0xFF6366F1).copy(alpha = 0.85f)
                        else      -> Color.Transparent
                    }
                ) {
                    Text(
                        text = camera.recordModeLabel,
                        modifier = Modifier.padding(horizontal = 5.dp, vertical = 2.dp),
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Bold,
                        color = Color.White
                    )
                }
            }

            // Camera name + live dot (bottom)
            Row(
                modifier = Modifier
                    .align(Alignment.BottomStart)
                    .padding(8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                val infiniteTransition = rememberInfiniteTransition(label = "pulse")
                val alpha by infiniteTransition.animateFloat(
                    initialValue = 0.4f, targetValue = 1f,
                    animationSpec = infiniteRepeatable(
                        animation = tween(1000, easing = LinearEasing),
                        repeatMode = RepeatMode.Reverse
                    ),
                    label = "alpha"
                )
                Box(
                    modifier = Modifier
                        .size(7.dp)
                        .clip(CircleShape)
                        .background(StatusLive.copy(alpha = alpha))
                )
                Spacer(modifier = Modifier.width(6.dp))
                Text(
                    text = camera.name,
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = OnDarkSlate,
                    maxLines = 1
                )
            }
        }
    }
}
