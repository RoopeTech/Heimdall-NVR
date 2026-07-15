package com.example.heimdallnvr

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.example.heimdallnvr.repo.AuthRepository
import com.example.heimdallnvr.ui.CameraGridScreen
import com.example.heimdallnvr.ui.LiveViewScreen
import com.example.heimdallnvr.ui.LoginScreen
import com.example.heimdallnvr.viewmodel.NvrViewModel
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        
        val authRepo = AuthRepository(applicationContext)

        setContent {
            MaterialTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    val navController = rememberNavController()
                    val coroutineScope = rememberCoroutineScope()
                    val serverUrl by authRepo.serverUrl.collectAsState(initial = null)
                    val apiToken by authRepo.apiToken.collectAsState(initial = null)
                    
                    val factory = object : ViewModelProvider.Factory {
                        override fun <T : ViewModel> create(modelClass: Class<T>): T {
                            return NvrViewModel(authRepo) as T
                        }
                    }
                    val viewModel: NvrViewModel = viewModel(factory = factory)

                    NavHost(
                        navController = navController,
                        startDestination = if (serverUrl != null && apiToken != null) "grid" else "login"
                    ) {
                        var selectedCamera by androidx.compose.runtime.mutableStateOf<com.example.heimdallnvr.data.Camera?>(null)

                        composable("login") {
                            LoginScreen(
                                onLoginClick = { url, token ->
                                    coroutineScope.launch {
                                        authRepo.saveAuthData(url, token)
                                        navController.navigate("grid") {
                                            popUpTo("login") { inclusive = true }
                                        }
                                    }
                                }
                            )
                        }
                        composable("grid") {
                            val url = serverUrl ?: return@composable
                            val token = apiToken ?: return@composable
                            
                            val cameras by viewModel.cameras.collectAsState()
                            val isLoading by viewModel.isLoading.collectAsState()
                            val error by viewModel.error.collectAsState()
                            
                            androidx.compose.runtime.LaunchedEffect(Unit) {
                                viewModel.loadCameras(url, token)
                            }
                            
                            CameraGridScreen(
                                cameras = cameras,
                                serverUrl = url,
                                apiToken = token,
                                error = error,
                                isLoading = isLoading,
                                onCameraClick = { camera ->
                                    selectedCamera = camera
                                    navController.navigate("live")
                                },
                                onLogout = {
                                    coroutineScope.launch {
                                        authRepo.clearAuthData()
                                        navController.navigate("login") {
                                            popUpTo("grid") { inclusive = true }
                                        }
                                    }
                                }
                            )
                        }
                        composable("live") {
                            val camera = selectedCamera
                            val url = serverUrl
                            val token = apiToken
                            
                            if (camera != null && url != null && token != null) {
                                LiveViewScreen(
                                    camera = camera,
                                    serverUrl = url,
                                    apiToken = token,
                                    onBack = { navController.popBackStack() }
                                )
                            } else {
                                navController.popBackStack()
                            }
                        }
                    }
                }
            }
        }
    }
}
