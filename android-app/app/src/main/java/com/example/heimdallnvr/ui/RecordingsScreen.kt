package com.example.heimdallnvr.ui

import android.app.DatePickerDialog
import android.graphics.BitmapFactory
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.media3.common.MediaItem
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.ProgressiveMediaSource
import androidx.media3.ui.PlayerView
import com.example.heimdallnvr.api.sharedOkHttpClient
import com.example.heimdallnvr.data.Camera
import com.example.heimdallnvr.data.Recording
import com.example.heimdallnvr.theme.*
import com.example.heimdallnvr.viewmodel.RecordingsViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.Request
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Calendar

@OptIn(UnstableApi::class, ExperimentalMaterial3Api::class)
@Composable
fun RecordingsScreen(
    serverUrl: String,
    apiToken: String,
    cameras: List<Camera>,
    modifier: Modifier = Modifier,
    viewModel: RecordingsViewModel = viewModel()
) {
    val recordings by viewModel.recordings.collectAsStateWithLifecycle()
    val isLoading by viewModel.isLoading.collectAsStateWithLifecycle()
    val error by viewModel.error.collectAsStateWithLifecycle()
    val selectedRecording by viewModel.selectedRecording.collectAsStateWithLifecycle()
    val selectedDate by viewModel.selectedDate.collectAsStateWithLifecycle()
    val selectedCameraId by viewModel.selectedCameraId.collectAsStateWithLifecycle()

    val context = LocalContext.current
    val fmt = DateTimeFormatter.ofPattern("yyyy-MM-dd")
    val displayFmt = DateTimeFormatter.ofPattern("MMM d, yyyy")

    // Load on mount and when filters change
    LaunchedEffect(selectedDate, selectedCameraId) {
        viewModel.load(serverUrl, apiToken)
    }

    // ExoPlayer for selected recording
    val exoPlayer = remember {
        ExoPlayer.Builder(context).build()
    }
    DisposableEffect(Unit) { onDispose { exoPlayer.release() } }

    LaunchedEffect(selectedRecording) {
        val rec = selectedRecording
        if (rec != null) {
            val url = "$serverUrl/api/recordings/play/${rec.filename}?token=$apiToken"
            val dataSourceFactory = DefaultHttpDataSource.Factory()
                .setDefaultRequestProperties(mapOf("Authorization" to "Bearer $apiToken"))
            val source = ProgressiveMediaSource.Factory(dataSourceFactory)
                .createMediaSource(MediaItem.fromUri(url))
            exoPlayer.setMediaSource(source)
            exoPlayer.prepare()
            exoPlayer.play()
        } else {
            exoPlayer.stop()
            exoPlayer.clearMediaItems()
        }
    }

    Column(modifier = Modifier.fillMaxSize().background(DarkSlate)) {

        // ── Filter bar ────────────────────────────────────────────────────────
        Surface(color = DarkSlateElevated, tonalElevation = 2.dp) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 10.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                // Date picker button
                OutlinedButton(
                    onClick = {
                        val now = selectedDate
                        val cal = Calendar.getInstance().apply {
                            set(now.year, now.monthValue - 1, now.dayOfMonth)
                        }
                        DatePickerDialog(
                            context,
                            { _, y, m, d ->
                                viewModel.selectedDate.value = LocalDate.of(y, m + 1, d)
                            },
                            cal.get(Calendar.YEAR),
                            cal.get(Calendar.MONTH),
                            cal.get(Calendar.DAY_OF_MONTH)
                        ).show()
                    },
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = NeonOrange),
                    border = androidx.compose.foundation.BorderStroke(1.dp, NeonOrange.copy(alpha = 0.4f)),
                    modifier = Modifier.weight(1f)
                ) {
                    Icon(Icons.Default.CalendarMonth, null, modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(4.dp))
                    Text(selectedDate.format(displayFmt), maxLines = 1)
                }

                // Camera selector
                var camMenuExpanded by remember { mutableStateOf(false) }
                Box(modifier = Modifier.weight(1f)) {
                    OutlinedButton(
                        onClick = { camMenuExpanded = true },
                        colors = ButtonDefaults.outlinedButtonColors(contentColor = NeonOrange),
                        border = androidx.compose.foundation.BorderStroke(1.dp, NeonOrange.copy(alpha = 0.4f)),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Icon(Icons.Default.Videocam, null, modifier = Modifier.size(16.dp))
                        Spacer(Modifier.width(4.dp))
                        Text(
                            cameras.find { it.id == selectedCameraId }?.name ?: "All Cameras",
                            maxLines = 1
                        )
                    }
                    DropdownMenu(
                        expanded = camMenuExpanded,
                        onDismissRequest = { camMenuExpanded = false },
                        containerColor = DarkSlateElevated
                    ) {
                        DropdownMenuItem(
                            text = { Text("All Cameras") },
                            onClick = {
                                viewModel.selectedCameraId.value = null
                                camMenuExpanded = false
                            }
                        )
                        cameras.forEach { cam ->
                            DropdownMenuItem(
                                text = { Text(cam.name) },
                                onClick = {
                                    viewModel.selectedCameraId.value = cam.id
                                    camMenuExpanded = false
                                }
                            )
                        }
                    }
                }

                // Refresh
                IconButton(onClick = { viewModel.load(serverUrl, apiToken) }) {
                    Icon(Icons.Default.Refresh, "Refresh", tint = NeonOrange)
                }
            }
        }

        // ── Video player (shown when a recording is selected) ─────────────────
        if (selectedRecording != null) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .aspectRatio(16f / 9f)
                    .background(Color.Black)
            ) {
                AndroidView(
                    factory = {
                        PlayerView(it).apply {
                            player = exoPlayer
                            useController = true
                        }
                    },
                    modifier = Modifier.fillMaxSize()
                )
                // Close button
                IconButton(
                    onClick = { viewModel.selectRecording(null) },
                    modifier = Modifier.align(Alignment.TopEnd).padding(8.dp)
                        .size(36.dp).clip(RoundedCornerShape(50))
                        .background(GlassDark)
                ) {
                    Icon(Icons.Default.Close, "Close", tint = Color.White, modifier = Modifier.size(18.dp))
                }
            }
        }

        // ── Recordings list ───────────────────────────────────────────────────
        when {
            isLoading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = NeonOrange)
            }
            error != null -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text(error ?: "", color = StatusError)
            }
            recordings.isEmpty() -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text("No recordings for ${selectedDate.format(displayFmt)}", color = OnDarkSlate.copy(alpha = 0.5f))
            }
            else -> LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                items(recordings.sortedByDescending { it.startTime }) { rec ->
                    RecordingCard(
                        recording = rec,
                        serverUrl = serverUrl,
                        apiToken = apiToken,
                        isSelected = selectedRecording?.id == rec.id,
                        onClick = {
                            viewModel.selectRecording(if (selectedRecording?.id == rec.id) null else rec)
                        }
                    )
                }
            }
        }
    }
}

@Composable
private fun RecordingCard(
    recording: Recording,
    serverUrl: String,
    apiToken: String,
    isSelected: Boolean,
    onClick: () -> Unit
) {
    var thumbnail by remember(recording.filename) { mutableStateOf<ImageBitmap?>(null) }

    // Load thumbnail asynchronously
    LaunchedEffect(recording.filename) {
        withContext(Dispatchers.IO) {
            try {
                val req = Request.Builder()
                    .url("$serverUrl/api/recordings/thumbnail/${recording.filename}")
                    .addHeader("Authorization", "Bearer $apiToken")
                    .build()
                val resp = sharedOkHttpClient.newCall(req).execute()
                if (resp.isSuccessful) {
                    val bytes = resp.body?.bytes()
                    if (bytes != null) {
                        val bmp = BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
                        thumbnail = bmp?.asImageBitmap()
                    }
                }
                resp.close()
            } catch (_: Exception) {}
        }
    }

    val durationMin = (recording.duration / 60).toInt()
    val durationSec = (recording.duration % 60).toInt()
    val durationStr = if (durationMin > 0) "${durationMin}m ${durationSec}s" else "${durationSec}s"
    val isLongRecording = recording.duration >= 300 // 5 min = continuous segment

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .then(
                if (isSelected) Modifier.border(2.dp, NeonOrange, RoundedCornerShape(12.dp))
                else Modifier
            ),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = DarkSlateElevated)
    ) {
        Row(modifier = Modifier.fillMaxWidth().height(80.dp)) {
            // Thumbnail
            Box(modifier = Modifier.width(130.dp).fillMaxHeight().background(Color.Black)) {
                if (thumbnail != null) {
                    Image(
                        bitmap = thumbnail!!,
                        contentDescription = null,
                        contentScale = ContentScale.Crop,
                        modifier = Modifier.fillMaxSize()
                    )
                } else {
                    Icon(Icons.Default.Videocam, null, tint = OnDarkSlate.copy(alpha = 0.2f),
                        modifier = Modifier.align(Alignment.Center))
                }
                if (isSelected) {
                    Box(Modifier.fillMaxSize().background(NeonOrange.copy(alpha = 0.25f))) {
                        Icon(Icons.Default.PlayCircle, null, tint = Color.White,
                            modifier = Modifier.size(32.dp).align(Alignment.Center))
                    }
                }
            }

            // Info
            Column(
                modifier = Modifier.fillMaxHeight().padding(12.dp),
                verticalArrangement = Arrangement.SpaceBetween
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = recording.cameraName.ifBlank { "Camera ${recording.cameraId}" },
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.SemiBold,
                        color = OnDarkSlate,
                        modifier = Modifier.weight(1f)
                    )
                    Surface(
                        shape = RoundedCornerShape(4.dp),
                        color = if (isLongRecording) StatusError.copy(alpha = 0.2f)
                                else NeonOrange.copy(alpha = 0.2f)
                    ) {
                        Text(
                            text = if (isLongRecording) "CONTINUOUS" else "CLIP",
                            modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                            style = MaterialTheme.typography.labelSmall,
                            color = if (isLongRecording) StatusError else NeonOrange
                        )
                    }
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.AccessTime, null, tint = OnDarkSlate.copy(alpha = 0.5f),
                        modifier = Modifier.size(14.dp))
                    Spacer(Modifier.width(4.dp))
                    Text(
                        // Show only the time portion of the ISO string
                        text = recording.startTime.substringAfter("T").take(8).ifBlank { recording.startTime },
                        style = MaterialTheme.typography.bodySmall,
                        color = OnDarkSlate.copy(alpha = 0.6f)
                    )
                    Spacer(Modifier.width(12.dp))
                    Icon(Icons.Default.Timer, null, tint = OnDarkSlate.copy(alpha = 0.5f),
                        modifier = Modifier.size(14.dp))
                    Spacer(Modifier.width(4.dp))
                    Text(durationStr, style = MaterialTheme.typography.bodySmall,
                        color = OnDarkSlate.copy(alpha = 0.6f))
                }
            }
        }
    }
}
