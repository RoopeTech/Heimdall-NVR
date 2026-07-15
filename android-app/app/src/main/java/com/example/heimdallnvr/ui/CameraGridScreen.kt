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
import com.example.heimdallnvr.data.Camera

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CameraGridScreen(
    cameras: List<Camera>,
    serverUrl: String,
    apiToken: String,
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
        Box(modifier = Modifier.fillMaxSize()) {
            val snapshotUrl = "$serverUrl/api/cameras/${camera.id}/snapshot"
            // For production, we'd add the Authorization header to Coil's request
            
            Text(
                text = camera.name,
                color = MaterialTheme.colorScheme.onSurface,
                modifier = Modifier.padding(16.dp)
            )
        }
    }
}
