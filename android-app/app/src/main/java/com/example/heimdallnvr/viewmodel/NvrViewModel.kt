package com.example.heimdallnvr.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.heimdallnvr.api.NvrApi
import com.example.heimdallnvr.data.Camera
import com.example.heimdallnvr.data.Group
import com.example.heimdallnvr.repo.AuthRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch


class NvrViewModel(private val authRepo: AuthRepository) : ViewModel() {

    private val _cameras = MutableStateFlow<List<Camera>>(emptyList())
    val cameras: StateFlow<List<Camera>> = _cameras

    private val _groups = MutableStateFlow<List<Group>>(emptyList())
    val groups: StateFlow<List<Group>> = _groups

    private val _isLoading = MutableStateFlow(false)
    val isLoading: StateFlow<Boolean> = _isLoading

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error

    /** Holds the camera selected from the grid for navigation to LiveView or CameraDetail. */
    private val _selectedCamera = MutableStateFlow<Camera?>(null)
    val selectedCamera: StateFlow<Camera?> = _selectedCamera

    fun selectCamera(camera: Camera) { _selectedCamera.value = camera }

    fun loadAll(serverUrl: String, token: String) {
        viewModelScope.launch {
            _isLoading.value = true
            _error.value = null
            try {
                val api = NvrApi.create(serverUrl)
                val auth = "Bearer $token"
                // Load cameras and groups in parallel using async to properly catch exceptions
                _cameras.value = api.getCameras(auth)
                try { _groups.value = api.getGroups(auth) } catch (_: Exception) {}
            } catch (e: Exception) {
                _error.value = "Failed to load cameras: ${e.message}"
            } finally {
                _isLoading.value = false
            }
        }
    }

    // Kept for back-compat with any call site that passes only cameras arg
    fun loadCameras(serverUrl: String, token: String) = loadAll(serverUrl, token)
}
