package com.example.heimdallnvr.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.heimdallnvr.api.NvrApi
import com.example.heimdallnvr.data.Camera
import com.example.heimdallnvr.repo.AuthRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

class NvrViewModel(private val authRepo: AuthRepository) : ViewModel() {
    
    private val _cameras = MutableStateFlow<List<Camera>>(emptyList())
    val cameras: StateFlow<List<Camera>> = _cameras

    private val _isLoading = MutableStateFlow(false)
    val isLoading: StateFlow<Boolean> = _isLoading
    
    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error

    fun loadCameras(serverUrl: String, token: String) {
        viewModelScope.launch {
            _isLoading.value = true
            _error.value = null
            try {
                val api = NvrApi.create(serverUrl)
                val response = api.getCameras("Bearer $token")
                _cameras.value = response
            } catch (e: Exception) {
                _error.value = "Failed to load cameras: ${e.message}"
            } finally {
                _isLoading.value = false
            }
        }
    }
}
