package com.example.heimdallnvr.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.*
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.material3.TabRowDefaults.tabIndicatorOffset
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.heimdallnvr.data.Camera
import com.example.heimdallnvr.data.Event
import com.example.heimdallnvr.data.PtzRequest
import com.example.heimdallnvr.theme.*
import com.example.heimdallnvr.viewmodel.CameraDetailViewModel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

enum class LiveViewTab { LIVE, EVENTS }

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LiveViewScreen(
    camera: Camera,
    serverUrl: String,
    apiToken: String,
    onBack: () -> Unit,
    viewModel: CameraDetailViewModel = viewModel()
) {
    val coroutineScope = rememberCoroutineScope()
    var activeTab by remember { mutableStateOf(LiveViewTab.LIVE) }
    var controlsVisible by remember { mutableStateOf(true) }

    val events by viewModel.events.collectAsStateWithLifecycle()
    val todayRecordings by viewModel.todayRecordings.collectAsStateWithLifecycle()
    val isRecording by viewModel.isRecording.collectAsStateWithLifecycle()
    val recordMessage by viewModel.recordMessage.collectAsStateWithLifecycle()

    // Start event polling when composable is active
    LaunchedEffect(camera.id) {
        viewModel.startPolling(serverUrl, apiToken, camera.id)
    }
    DisposableEffect(camera.id) { onDispose { viewModel.stopPolling() } }

    // Auto-hide controls after 3s of inactivity
    LaunchedEffect(controlsVisible) {
        if (controlsVisible) {
            delay(4000)
            controlsVisible = false
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black)
            .pointerInput(Unit) {
                detectTapGestures { controlsVisible = true }
            }
    ) {
        // ── Video feed (full screen) ──────────────────────────────────────────
        LiveCameraFeed(
            serverUrl = serverUrl,
            cameraId = camera.id,
            apiToken = apiToken,
            pollIntervalMs = 500L,
            highQuality = true,
            contentScale = ContentScale.Fit,
            modifier = Modifier.fillMaxSize()
        )

        // ── Record toast ──────────────────────────────────────────────────────
        AnimatedVisibility(
            visible = recordMessage != null,
            enter = fadeIn(), exit = fadeOut(),
            modifier = Modifier.align(Alignment.BottomCenter).padding(bottom = 120.dp)
        ) {
            Surface(
                shape = RoundedCornerShape(24.dp),
                color = GlassDark
            ) {
                Text(
                    text = recordMessage ?: "",
                    color = Color.White,
                    modifier = Modifier.padding(horizontal = 20.dp, vertical = 10.dp)
                )
            }
        }

        // ── Overlay controls (shown on tap, auto-hide) ────────────────────────
        AnimatedVisibility(
            visible = controlsVisible,
            enter = fadeIn(animationSpec = tween(200)),
            exit = fadeOut(animationSpec = tween(600))
        ) {
            Box(modifier = Modifier.fillMaxSize()) {

                // Tab bar (Live / Events)
                TabRow(
                    selectedTabIndex = activeTab.ordinal,
                    modifier = Modifier.fillMaxWidth().align(Alignment.BottomCenter),
                    containerColor = GlassDark,
                    contentColor = NeonOrange,
                    indicator = { tabPositions ->
                        TabRowDefaults.SecondaryIndicator(
                            modifier = Modifier.tabIndicatorOffset(tabPositions[activeTab.ordinal]),
                            color = NeonOrange
                        )
                    }
                ) {
                    Tab(
                        selected = activeTab == LiveViewTab.LIVE,
                        onClick = { activeTab = LiveViewTab.LIVE },
                        text = { Text("LIVE") }
                    )
                    Tab(
                        selected = activeTab == LiveViewTab.EVENTS,
                        onClick = { activeTab = LiveViewTab.EVENTS },
                        text = { Text("EVENTS (${events.size})") }
                    )
                }

                // Top: Back button + camera name
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .align(Alignment.TopStart)
                        .statusBarsPadding()
                        .padding(horizontal = 16.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    IconButton(
                        onClick = onBack,
                        modifier = Modifier
                            .size(44.dp)
                            .clip(CircleShape)
                            .background(GlassDark)
                    ) {
                        Icon(Icons.Default.ArrowBack, "Back", tint = Color.White)
                    }
                    Spacer(Modifier.width(12.dp))
                    Text(
                        text = camera.name,
                        style = MaterialTheme.typography.titleMedium,
                        color = Color.White,
                        fontWeight = FontWeight.Bold
                    )
                    Spacer(Modifier.weight(1f))
                    // Live indicator
                    Row(
                        modifier = Modifier
                            .clip(CircleShape)
                            .background(GlassDark)
                            .padding(horizontal = 10.dp, vertical = 5.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        val infiniteTransition = rememberInfiniteTransition(label = "pulse")
                        val alpha by infiniteTransition.animateFloat(
                            0.4f, 1f,
                            infiniteRepeatable(tween(900), RepeatMode.Reverse),
                            label = "alpha"
                        )
                        Box(
                            modifier = Modifier.size(7.dp).clip(CircleShape)
                                .background(StatusLive.copy(alpha = alpha))
                        )
                        Spacer(Modifier.width(5.dp))
                        Text("LIVE", style = MaterialTheme.typography.labelSmall,
                            color = Color.White, fontWeight = FontWeight.Bold)
                    }
                }

                // Right side: Controls when LIVE tab is active
                if (activeTab == LiveViewTab.LIVE) {
                    Column(
                        modifier = Modifier
                            .align(Alignment.CenterEnd)
                            .padding(end = 12.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        // Record button
                        if (!camera.isViewOnly) {
                            GlassButton(
                                onClick = { viewModel.triggerRecord(serverUrl, apiToken, camera.id) },
                                enabled = !isRecording
                            ) {
                                Icon(
                                    Icons.Default.FiberManualRecord,
                                    contentDescription = "Record 15s",
                                    tint = if (isRecording) StatusLive else StatusError,
                                    modifier = Modifier.size(20.dp)
                                )
                            }
                        }

                        // PTZ Controls (only if camera has PTZ)
                        if (camera.ptzEnabled) {
                            PtzControlsOverlay(
                                onPtz = { action, pan, tilt, zoom ->
                                    viewModel.sendPtz(serverUrl, apiToken, camera.id,
                                        PtzRequest(action, pan, tilt, zoom))
                                }
                            )
                        }
                    }
                }

                // Events tab content overlay
                if (activeTab == LiveViewTab.EVENTS) {
                    Surface(
                        modifier = Modifier
                            .fillMaxWidth()
                            .fillMaxHeight(0.55f)
                            .align(Alignment.BottomCenter)
                            .padding(bottom = 48.dp), // leave room for tab row
                        color = GlassDark,
                        shape = RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp)
                    ) {
                        if (events.isEmpty()) {
                            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                                Text("No motion events today", color = OnDarkSlate.copy(alpha = 0.5f))
                            }
                        } else {
                            LazyColumn(
                                modifier = Modifier.fillMaxSize(),
                                contentPadding = PaddingValues(16.dp),
                                verticalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                items(events.sortedByDescending { it.timestamp }) { event ->
                                    EventRow(event)
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun GlassButton(
    onClick: () -> Unit,
    enabled: Boolean = true,
    content: @Composable () -> Unit
) {
    IconButton(
        onClick = onClick,
        enabled = enabled,
        modifier = Modifier
            .size(48.dp)
            .clip(CircleShape)
            .background(GlassDark)
    ) { content() }
}

@Composable
private fun PtzControlsOverlay(
    onPtz: (action: String, pan: Float, tilt: Float, zoom: Float) -> Unit
) {
    val coroutineScope = rememberCoroutineScope()

    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        // Up
        PtzButton(Icons.Default.KeyboardArrowUp, "Tilt Up") {
            onPtz("move", 0f, 0.5f, 1f)
        }
        Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            // Left
            PtzButton(Icons.Default.KeyboardArrowLeft, "Pan Left") {
                onPtz("move", -0.5f, 0f, 1f)
            }
            // Center / Stop
            PtzButton(Icons.Default.Stop, "Stop") {
                onPtz("stop", 0f, 0f, 1f)
            }
            // Right
            PtzButton(Icons.Default.KeyboardArrowRight, "Pan Right") {
                onPtz("move", 0.5f, 0f, 1f)
            }
        }
        // Down
        PtzButton(Icons.Default.KeyboardArrowDown, "Tilt Down") {
            onPtz("move", 0f, -0.5f, 1f)
        }
        Spacer(Modifier.height(4.dp))
        // Zoom in/out
        Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            PtzButton(Icons.Default.ZoomIn, "Zoom In") {
                onPtz("move", 0f, 0f, 3f)
            }
            PtzButton(Icons.Default.ZoomOut, "Zoom Out") {
                onPtz("move", 0f, 0f, -1f)
            }
        }
        // Home
        PtzButton(Icons.Default.Home, "Home") {
            onPtz("home", 0f, 0f, 1f)
        }
    }
}

@Composable
private fun PtzButton(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    contentDescription: String,
    onClick: () -> Unit
) {
    IconButton(
        onClick = onClick,
        modifier = Modifier
            .size(38.dp)
            .clip(CircleShape)
            .background(GlassDark)
    ) {
        Icon(icon, contentDescription = contentDescription, tint = OnDarkSlate, modifier = Modifier.size(18.dp))
    }
}

@Composable
private fun EventRow(event: com.example.heimdallnvr.data.Event) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(8.dp))
            .background(DarkSlateElevated)
            .padding(12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(
            imageVector = if (event.type == "motion") Icons.Default.DirectionsRun else Icons.Default.Settings,
            contentDescription = null,
            tint = if (event.type == "motion") NeonOrange else OnDarkSlate.copy(alpha = 0.6f),
            modifier = Modifier.size(20.dp)
        )
        Spacer(Modifier.width(12.dp))
        Column {
            Text(
                text = event.type.replaceFirstChar { it.uppercase() },
                style = MaterialTheme.typography.bodyMedium,
                color = OnDarkSlate,
                fontWeight = FontWeight.SemiBold
            )
            Text(
                text = event.timestamp,
                style = MaterialTheme.typography.bodySmall,
                color = OnDarkSlate.copy(alpha = 0.5f)
            )
        }
    }
}
