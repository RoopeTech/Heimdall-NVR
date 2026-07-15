package com.example.heimdallnvr.ui

import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import com.example.heimdallnvr.theme.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LoginScreen(
    onLoginClick: (String, String) -> Unit
) {
    var serverUrl by remember { mutableStateOf("") }
    var apiToken by remember { mutableStateOf("") }

    // Animated background gradient
    val infiniteTransition = rememberInfiniteTransition(label = "bg")
    val xOffset by infiniteTransition.animateFloat(
        initialValue = 0f,
        targetValue = 1000f,
        animationSpec = infiniteRepeatable(
            animation = tween(10000, easing = LinearEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "xOffset"
    )

    val backgroundBrush = Brush.linearGradient(
        colors = listOf(DarkSlate, Color(0xFF1E1E3F), DarkSlate),
        start = Offset(xOffset, 0f),
        end = Offset(xOffset + 500f, 1000f)
    )

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(backgroundBrush),
        contentAlignment = Alignment.Center
    ) {
        // Glassmorphism Card
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .padding(32.dp)
                .clip(RoundedCornerShape(24.dp)),
            colors = CardDefaults.cardColors(
                containerColor = GlassDark
            ),
            elevation = CardDefaults.cardElevation(defaultElevation = 0.dp)
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(32.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Text(
                    text = "HEIMDALL",
                    style = MaterialTheme.typography.headlineLarge.copy(
                        fontWeight = FontWeight.Bold,
                        letterSpacing = 4.dp
                    ),
                    color = NeonOrange,
                    modifier = Modifier.padding(bottom = 8.dp)
                )
                Text(
                    text = "NVR SYSTEM",
                    style = MaterialTheme.typography.titleMedium.copy(
                        letterSpacing = 8.dp
                    ),
                    color = OnDarkSlate.copy(alpha = 0.7f),
                    modifier = Modifier.padding(bottom = 48.dp)
                )

                OutlinedTextField(
                    value = serverUrl,
                    onValueChange = { serverUrl = it },
                    label = { Text("Server URL") },
                    placeholder = { Text("http://192.168.1.100:8000") },
                    leadingIcon = {
                        Icon(Icons.Default.Settings, contentDescription = "Server")
                    },
                    shape = RoundedCornerShape(12.dp),
                    colors = TextFieldDefaults.outlinedTextFieldColors(
                        focusedBorderColor = NeonOrange,
                        unfocusedBorderColor = OnDarkSlate.copy(alpha = 0.3f),
                        cursorColor = NeonOrange
                    ),
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(bottom = 16.dp),
                    singleLine = true
                )

                OutlinedTextField(
                    value = apiToken,
                    onValueChange = { apiToken = it },
                    label = { Text("API Token") },
                    leadingIcon = {
                        Icon(Icons.Default.Lock, contentDescription = "Token")
                    },
                    visualTransformation = PasswordVisualTransformation(),
                    shape = RoundedCornerShape(12.dp),
                    colors = TextFieldDefaults.outlinedTextFieldColors(
                        focusedBorderColor = NeonOrange,
                        unfocusedBorderColor = OnDarkSlate.copy(alpha = 0.3f),
                        cursorColor = NeonOrange
                    ),
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(bottom = 32.dp),
                    singleLine = true
                )

                Button(
                    onClick = { onLoginClick(serverUrl, apiToken) },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(56.dp),
                    shape = RoundedCornerShape(16.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = NeonOrange,
                        contentColor = Color.Black
                    ),
                    enabled = serverUrl.isNotBlank() && apiToken.isNotBlank()
                ) {
                    Text(
                        text = "CONNECT",
                        fontWeight = FontWeight.Bold,
                        letterSpacing = 2.dp
                    )
                }
            }
        }
    }
}
