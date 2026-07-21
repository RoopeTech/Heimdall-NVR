package com.example.heimdallnvr.ui

import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.heimdallnvr.theme.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LoginScreen(
    onLoginSuccess: (serverUrl: String, token: String) -> Unit,
    onLoginError: (String) -> Unit = {},
    isLoading: Boolean = false,
    errorMessage: String? = null
) {
    var serverUrl by remember { mutableStateOf("") }
    var username by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var passwordVisible by remember { mutableStateOf(false) }

    // Animated background
    val infiniteTransition = rememberInfiniteTransition(label = "bg")
    val xOffset by infiniteTransition.animateFloat(
        initialValue = 0f, targetValue = 1000f,
        animationSpec = infiniteRepeatable(
            animation = tween(10000, easing = LinearEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "xOffset"
    )

    val backgroundBrush = Brush.linearGradient(
        colors = listOf(DarkSlate, Color(0xFF1A0A2E), DarkSlate),
        start = Offset(xOffset, 0f),
        end = Offset(xOffset + 500f, 1000f)
    )

    Box(
        modifier = Modifier.fillMaxSize().background(backgroundBrush),
        contentAlignment = Alignment.Center
    ) {
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .padding(32.dp)
                .clip(RoundedCornerShape(24.dp)),
            colors = CardDefaults.cardColors(containerColor = GlassDark),
            elevation = CardDefaults.cardElevation(defaultElevation = 0.dp)
        ) {
            Column(
                modifier = Modifier.fillMaxWidth().padding(32.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Text(
                    text = "HEIMDALL",
                    style = MaterialTheme.typography.headlineLarge.copy(
                        fontWeight = FontWeight.Bold, letterSpacing = 4.sp
                    ),
                    color = NeonOrange,
                    modifier = Modifier.padding(bottom = 4.dp)
                )
                Text(
                    text = "NVR SYSTEM",
                    style = MaterialTheme.typography.titleMedium.copy(letterSpacing = 8.sp),
                    color = OnDarkSlate.copy(alpha = 0.7f),
                    modifier = Modifier.padding(bottom = 40.dp)
                )

                // Error display
                if (errorMessage != null) {
                    Surface(
                        modifier = Modifier.fillMaxWidth().padding(bottom = 16.dp),
                        shape = RoundedCornerShape(8.dp),
                        color = StatusError.copy(alpha = 0.15f)
                    ) {
                        Text(
                            text = errorMessage,
                            color = StatusError,
                            modifier = Modifier.padding(12.dp),
                            style = MaterialTheme.typography.bodySmall
                        )
                    }
                }

                // Server URL
                OutlinedTextField(
                    value = serverUrl,
                    onValueChange = { serverUrl = it },
                    label = { Text("Server URL") },
                    placeholder = { Text("http://192.168.1.100:8000") },
                    leadingIcon = { Icon(Icons.Default.Settings, contentDescription = null) },
                    shape = RoundedCornerShape(12.dp),
                    colors = TextFieldDefaults.colors(
                        focusedContainerColor = Color.Transparent,
                        unfocusedContainerColor = Color.Transparent,
                        focusedIndicatorColor = NeonOrange,
                        unfocusedIndicatorColor = OnDarkSlate.copy(alpha = 0.3f),
                        cursorColor = NeonOrange,
                        focusedLabelColor = NeonOrange
                    ),
                    modifier = Modifier.fillMaxWidth().padding(bottom = 12.dp),
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri)
                )

                // Username
                OutlinedTextField(
                    value = username,
                    onValueChange = { username = it },
                    label = { Text("Username") },
                    leadingIcon = { Icon(Icons.Default.Person, contentDescription = null) },
                    shape = RoundedCornerShape(12.dp),
                    colors = TextFieldDefaults.colors(
                        focusedContainerColor = Color.Transparent,
                        unfocusedContainerColor = Color.Transparent,
                        focusedIndicatorColor = NeonOrange,
                        unfocusedIndicatorColor = OnDarkSlate.copy(alpha = 0.3f),
                        cursorColor = NeonOrange,
                        focusedLabelColor = NeonOrange
                    ),
                    modifier = Modifier.fillMaxWidth().padding(bottom = 12.dp),
                    singleLine = true
                )

                // Password
                OutlinedTextField(
                    value = password,
                    onValueChange = { password = it },
                    label = { Text("Password") },
                    leadingIcon = { Icon(Icons.Default.Lock, contentDescription = null) },
                    trailingIcon = {
                        IconButton(onClick = { passwordVisible = !passwordVisible }) {
                            Icon(
                                if (passwordVisible) Icons.Default.VisibilityOff else Icons.Default.Visibility,
                                contentDescription = if (passwordVisible) "Hide password" else "Show password",
                                tint = OnDarkSlate.copy(alpha = 0.5f)
                            )
                        }
                    },
                    visualTransformation = if (passwordVisible) VisualTransformation.None
                                           else PasswordVisualTransformation(),
                    shape = RoundedCornerShape(12.dp),
                    colors = TextFieldDefaults.colors(
                        focusedContainerColor = Color.Transparent,
                        unfocusedContainerColor = Color.Transparent,
                        focusedIndicatorColor = NeonOrange,
                        unfocusedIndicatorColor = OnDarkSlate.copy(alpha = 0.3f),
                        cursorColor = NeonOrange,
                        focusedLabelColor = NeonOrange
                    ),
                    modifier = Modifier.fillMaxWidth().padding(bottom = 32.dp),
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password)
                )

                Button(
                    onClick = { onLoginSuccess(serverUrl.trim(), "$username:$password") },
                    modifier = Modifier.fillMaxWidth().height(56.dp),
                    shape = RoundedCornerShape(16.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = NeonOrange,
                        contentColor = Color.Black
                    ),
                    enabled = serverUrl.isNotBlank() && username.isNotBlank() && password.isNotBlank() && !isLoading
                ) {
                    if (isLoading) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(20.dp),
                            color = Color.Black,
                            strokeWidth = 2.dp
                        )
                    } else {
                        Text("CONNECT", fontWeight = FontWeight.Bold, letterSpacing = 2.sp)
                    }
                }
            }
        }
    }
}
