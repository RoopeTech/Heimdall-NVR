package com.example.heimdallnvr

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Logout
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material.icons.filled.VideoLibrary
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.example.heimdallnvr.repo.AuthRepository
import com.example.heimdallnvr.theme.*
import com.example.heimdallnvr.ui.*
import com.example.heimdallnvr.viewmodel.NvrViewModel
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        val authRepo = AuthRepository(applicationContext)

        setContent {
            HeimdallNVRTheme {
                Surface(modifier = Modifier.fillMaxSize(), color = DarkSlate) {
                    val navController = rememberNavController()
                    val coroutineScope = rememberCoroutineScope()

                    val serverUrl by authRepo.serverUrl.collectAsState(initial = null)
                    val sessionToken by authRepo.sessionToken.collectAsState(initial = null)
                    val role by authRepo.role.collectAsState(initial = null)
                    val isAdmin = role == "admin"

                    // ViewModel factory
                    val factory = remember(authRepo) {
                        object : ViewModelProvider.Factory {
                            override fun <T : ViewModel> create(modelClass: Class<T>): T {
                                @Suppress("UNCHECKED_CAST")
                                return NvrViewModel(authRepo) as T
                            }
                        }
                    }
                    val nvrViewModel: NvrViewModel = viewModel(factory = factory)
                    val selectedCamera by nvrViewModel.selectedCamera.collectAsState()

                    // Login error state hoisted here so LoginScreen can display it
                    var loginError by remember { mutableStateOf<String?>(null) }
                    var loginLoading by remember { mutableStateOf(false) }

                    val startDestination = if (!serverUrl.isNullOrBlank() && !sessionToken.isNullOrBlank())
                        "grid" else "login"

                    NavHost(navController = navController, startDestination = startDestination) {

                        // ── Login ─────────────────────────────────────────────
                        composable("login") {
                            LoginScreen(
                                isLoading = loginLoading,
                                errorMessage = loginError,
                                onLoginSuccess = { url, credentials ->
                                    // credentials = "username:password" from LoginScreen
                                    val parts = credentials.split(":", limit = 2)
                                    val username = parts.getOrNull(0) ?: ""
                                    val password = parts.getOrNull(1) ?: ""
                                    coroutineScope.launch {
                                        loginLoading = true
                                        loginError = null
                                        try {
                                            authRepo.login(url, username, password)
                                            navController.navigate("grid") {
                                                popUpTo("login") { inclusive = true }
                                            }
                                        } catch (e: Exception) {
                                            loginError = "Login failed: ${e.message}"
                                        } finally {
                                            loginLoading = false
                                        }
                                    }
                                }
                            )
                        }

                        // ── Main with bottom nav ──────────────────────────────
                        composable("grid") {
                            val url = serverUrl
                            val token = sessionToken
                            
                            if (url == null || token == null) {
                                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                                    CircularProgressIndicator(color = NeonOrange)
                                }
                                return@composable
                            }

                            val cameras by nvrViewModel.cameras.collectAsState()
                            val groups by nvrViewModel.groups.collectAsState()
                            val isLoading by nvrViewModel.isLoading.collectAsState()
                            val error by nvrViewModel.error.collectAsState()

                            LaunchedEffect(Unit) { nvrViewModel.loadAll(url, token) }

                            MainScaffold(
                                navController = navController,
                                isAdmin = isAdmin,
                                onLogout = {
                                    coroutineScope.launch {
                                        authRepo.clearAuthData()
                                        navController.navigate("login") {
                                            popUpTo("grid") { inclusive = true }
                                        }
                                    }
                                }
                            ) { innerPadding ->
                                CameraGridScreen(
                                    cameras = cameras,
                                    groups = groups,
                                    serverUrl = url,
                                    apiToken = token,
                                    error = error,
                                    isLoading = isLoading,
                                    onRefresh = { nvrViewModel.loadAll(url, token) },
                                    onCameraClick = { camera ->
                                        nvrViewModel.selectCamera(camera)
                                        navController.navigate("live")
                                    },
                                    modifier = Modifier.padding(innerPadding)
                                )
                            }
                        }

                        // ── Live View ─────────────────────────────────────────
                        composable("live") {
                            val camera = selectedCamera
                            val url = serverUrl
                            val token = sessionToken
                            
                            if (camera == null || url == null || token == null) {
                                LaunchedEffect(Unit) {
                                    navController.popBackStack()
                                }
                                Box(modifier = Modifier.fillMaxSize())
                                return@composable
                            }
                            LiveViewScreen(
                                camera = camera,
                                serverUrl = url,
                                apiToken = token,
                                onBack = { navController.popBackStack() }
                            )
                        }

                        // ── Recordings ────────────────────────────────────────
                        composable("recordings") {
                            val url = serverUrl
                            val token = sessionToken
                            
                            if (url == null || token == null) {
                                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                                    CircularProgressIndicator(color = NeonOrange)
                                }
                                return@composable
                            }
                            val cameras by nvrViewModel.cameras.collectAsState()

                            MainScaffold(
                                navController = navController,
                                isAdmin = isAdmin,
                                onLogout = {
                                    coroutineScope.launch {
                                        authRepo.clearAuthData()
                                        navController.navigate("login") { popUpTo(0) }
                                    }
                                }
                            ) { innerPadding ->
                                RecordingsScreen(
                                    serverUrl = url,
                                    apiToken = token,
                                    cameras = cameras,
                                    modifier = Modifier.padding(innerPadding)
                                )
                            }
                        }

                        // ── Settings ──────────────────────────────────────────
                        composable("settings") {
                            val url = serverUrl
                            val token = sessionToken
                            
                            if (url == null || token == null) {
                                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                                    CircularProgressIndicator(color = NeonOrange)
                                }
                                return@composable
                            }

                            MainScaffold(
                                navController = navController,
                                isAdmin = isAdmin,
                                onLogout = {
                                    coroutineScope.launch {
                                        authRepo.clearAuthData()
                                        navController.navigate("login") { popUpTo(0) }
                                    }
                                }
                            ) { innerPadding ->
                                SettingsScreen(
                                    serverUrl = url,
                                    apiToken = token,
                                    isAdmin = isAdmin,
                                    modifier = Modifier.padding(innerPadding)
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

// ── Main scaffold with top bar and bottom navigation ──────────────────────────

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MainScaffold(
    navController: NavController,
    isAdmin: Boolean,
    onLogout: () -> Unit,
    content: @Composable (androidx.compose.foundation.layout.PaddingValues) -> Unit
) {
    val navBackStackEntry by navController.currentBackStackEntryAsState()
    val currentRoute = navBackStackEntry?.destination?.route ?: "grid"

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        "HEIMDALL",
                        fontWeight = androidx.compose.ui.text.font.FontWeight.Bold,
                        letterSpacing = androidx.compose.ui.unit.TextUnit(2f, androidx.compose.ui.unit.TextUnitType.Sp),
                        color = NeonOrange
                    )
                },
                actions = {
                    IconButton(onClick = onLogout) {
                        Icon(Icons.Default.Logout, contentDescription = "Logout", tint = OnDarkSlate)
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = DarkSlateElevated)
            )
        },
        bottomBar = {
            NavigationBar(containerColor = DarkSlateElevated, tonalElevation = 0.dp) {
                NavigationBarItem(
                    selected = currentRoute == "grid",
                    onClick = {
                        if (currentRoute != "grid") navController.navigate("grid") {
                            launchSingleTop = true; popUpTo("grid")
                        }
                    },
                    icon = { Icon(Icons.Default.Videocam, "Cameras") },
                    label = { Text("Cameras") },
                    colors = NavigationBarItemDefaults.colors(
                        selectedIconColor = NeonOrange, selectedTextColor = NeonOrange,
                        unselectedIconColor = OnDarkSlate.copy(alpha = 0.5f),
                        indicatorColor = NeonOrange.copy(alpha = 0.12f)
                    )
                )
                NavigationBarItem(
                    selected = currentRoute == "recordings",
                    onClick = {
                        if (currentRoute != "recordings") navController.navigate("recordings") {
                            launchSingleTop = true; popUpTo("grid")
                        }
                    },
                    icon = { Icon(Icons.Default.VideoLibrary, "Recordings") },
                    label = { Text("Recordings") },
                    colors = NavigationBarItemDefaults.colors(
                        selectedIconColor = NeonOrange, selectedTextColor = NeonOrange,
                        unselectedIconColor = OnDarkSlate.copy(alpha = 0.5f),
                        indicatorColor = NeonOrange.copy(alpha = 0.12f)
                    )
                )
                if (isAdmin) {
                    NavigationBarItem(
                        selected = currentRoute == "settings",
                        onClick = {
                            if (currentRoute != "settings") navController.navigate("settings") {
                                launchSingleTop = true; popUpTo("grid")
                            }
                        },
                        icon = { Icon(Icons.Default.Settings, "Settings") },
                        label = { Text("Settings") },
                        colors = NavigationBarItemDefaults.colors(
                            selectedIconColor = NeonOrange, selectedTextColor = NeonOrange,
                            unselectedIconColor = OnDarkSlate.copy(alpha = 0.5f),
                            indicatorColor = NeonOrange.copy(alpha = 0.12f)
                        )
                    )
                }
            }
        },
        containerColor = DarkSlate
    ) { innerPadding -> content(innerPadding) }
}
