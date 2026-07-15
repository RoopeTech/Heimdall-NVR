package com.example.heimdallnvr.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import coil3.request.ImageRequest
import coil3.request.crossfade
import coil3.request.CachePolicy
import coil3.network.NetworkHeaders
import coil3.network.httpHeaders
import androidx.compose.ui.platform.LocalContext
import com.example.heimdallnvr.data.Camera
import kotlinx.coroutines.delay

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CameraGridScreen(
    cameras: List<Camera>,
    serverUrl: String,
    apiToken: String,
    error: String?,
    isLoading: Boolean,
    onCameraClick: (Camera) -> Unit,
    onLogout: () -> Unit
) {
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Cameras") },
                actions = {
                    IconButton(onClick = onLogout) {
                        Text("Logout")
                    }
                }
            )
        }
    ) { padding ->
        if (isLoading) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = androidx.compose.ui.Alignment.Center) {
                CircularProgressIndicator()
            }
        } else if (error != null) {
            Box(modifier = Modifier.fillMaxSize().padding(16.dp), contentAlignment = androidx.compose.ui.Alignment.Center) {
                Text(text = error, color = MaterialTheme.colorScheme.error)
            }
        } else if (cameras.isEmpty()) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = androidx.compose.ui.Alignment.Center) {
                Text("No cameras found")
            }
        } else {
            LazyVerticalGrid(
                columns = GridCells.Fixed(1),
                modifier = Modifier
                    .padding(padding)
                    .fillMaxSize(),
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                items(cameras) { camera ->
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
            .height(200.dp)
            .clickable { onClick() }
    ) {
        var timestamp by remember { mutableStateOf(System.currentTimeMillis()) }
        
        LaunchedEffect(Unit) {
            while (true) {
                delay(2000) // Poll every 2 seconds in grid
                timestamp = System.currentTimeMillis()
            }
        }

        Box(modifier = Modifier.fillMaxSize()) {
            val snapshotUrl = "$serverUrl/api/cameras/${camera.id}/snapshot?t=$timestamp"
            AsyncImage(
                model = ImageRequest.Builder(LocalContext.current)
                    .data(snapshotUrl)
                    .httpHeaders(NetworkHeaders.Builder().set("Authorization", "Bearer $apiToken").build())
                    .memoryCachePolicy(CachePolicy.DISABLED)
                    .diskCachePolicy(CachePolicy.DISABLED)
                    .build(),
                contentDescription = camera.name,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize()
            )
            
            Box(modifier = Modifier.fillMaxSize().padding(16.dp)) {
                Text(
                    text = camera.name,
                    color = androidx.compose.ui.graphics.Color.White,
                    modifier = Modifier
                        .align(androidx.compose.ui.Alignment.BottomStart)
                        .padding(horizontal = 8.dp, vertical = 4.dp)
                )
            }
        }
    }
}
