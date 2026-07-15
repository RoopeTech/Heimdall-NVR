package com.example.heimdallnvr.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.heimdallnvr.api.NvrApi
import com.example.heimdallnvr.data.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.async

class SettingsViewModel : ViewModel() {

    private val _settings = MutableStateFlow<SystemSettings?>(null)
    val settings: StateFlow<SystemSettings?> = _settings

    private val _users = MutableStateFlow<List<User>>(emptyList())
    val users: StateFlow<List<User>> = _users

    private val _apiTokens = MutableStateFlow<List<ApiToken>>(emptyList())
    val apiTokens: StateFlow<List<ApiToken>> = _apiTokens

    private val _cameras = MutableStateFlow<List<Camera>>(emptyList())
    val cameras: StateFlow<List<Camera>> = _cameras

    private val _groups = MutableStateFlow<List<Group>>(emptyList())
    val groups: StateFlow<List<Group>> = _groups

    private val _updateStatus = MutableStateFlow<UpdateStatus?>(null)
    val updateStatus: StateFlow<UpdateStatus?> = _updateStatus

    private val _isLoading = MutableStateFlow(false)
    val isLoading: StateFlow<Boolean> = _isLoading

    private val _message = MutableStateFlow<String?>(null)
    val message: StateFlow<String?> = _message

    private val _newlyGeneratedToken = MutableStateFlow<String?>(null)
    val newlyGeneratedToken: StateFlow<String?> = _newlyGeneratedToken

    private val _isCheckingUpdate = MutableStateFlow(false)
    val isCheckingUpdate: StateFlow<Boolean> = _isCheckingUpdate

    private val _isApplyingUpdate = MutableStateFlow(false)
    val isApplyingUpdate: StateFlow<Boolean> = _isApplyingUpdate

    fun loadAll(serverUrl: String, token: String, isAdmin: Boolean) {
        viewModelScope.launch {
            _isLoading.value = true
            val auth = "Bearer $token"
            val api = NvrApi.create(serverUrl)
            try {
                val s = async { api.getSettings(auth) }
                val c = async { api.getCameras(auth) }
                val g = async { api.getGroups(auth) }
                
                _settings.value = s.await()
                _cameras.value = c.await()
                _groups.value = g.await()
                
                if (isAdmin) {
                    val u = async { api.getUsers(auth) }
                    val t = async { api.getApiTokens(auth) }
                    _users.value = u.await()
                    _apiTokens.value = t.await()
                }
            } catch (e: Exception) {
                _message.value = "Load error: ${e.message}"
            } finally {
                _isLoading.value = false
            }
        }
    }

    fun saveSettings(serverUrl: String, token: String, patch: Map<String, String>) {
        viewModelScope.launch {
            try {
                NvrApi.create(serverUrl).saveSettings("Bearer $token", patch)
                _message.value = "Settings saved"
                _settings.value = NvrApi.create(serverUrl).getSettings("Bearer $token")
            } catch (e: Exception) { _message.value = "Save failed: ${e.message}" }
        }
    }

    fun testNotification(serverUrl: String, token: String, req: NotificationTestRequest) {
        viewModelScope.launch {
            try {
                NvrApi.create(serverUrl).testNotification("Bearer $token", req)
                _message.value = "Test notification sent"
            } catch (e: Exception) { _message.value = "Test failed: ${e.message}" }
        }
    }

    fun checkUpdate(serverUrl: String, token: String) {
        viewModelScope.launch {
            _isCheckingUpdate.value = true
            try { _updateStatus.value = NvrApi.create(serverUrl).checkUpdate("Bearer $token") }
            catch (e: Exception) { _message.value = "Update check failed: ${e.message}" }
            finally { _isCheckingUpdate.value = false }
        }
    }

    fun applyUpdate(serverUrl: String, token: String) {
        viewModelScope.launch {
            _isApplyingUpdate.value = true
            try {
                NvrApi.create(serverUrl).applyUpdate("Bearer $token")
                _message.value = "Update applied — server is restarting…"
            } catch (e: Exception) { _message.value = "Update failed: ${e.message}" }
            finally { _isApplyingUpdate.value = false }
        }
    }

    // ── Camera CRUD ────────────────────────────────────────────────────────────

    fun addCamera(serverUrl: String, token: String, req: CameraRequest) {
        viewModelScope.launch {
            try {
                NvrApi.create(serverUrl).addCamera("Bearer $token", req)
                _message.value = "Camera added"
                _cameras.value = NvrApi.create(serverUrl).getCameras("Bearer $token")
            } catch (e: Exception) { _message.value = "Add camera failed: ${e.message}" }
        }
    }

    fun updateCamera(serverUrl: String, token: String, id: Int, req: CameraRequest) {
        viewModelScope.launch {
            try {
                NvrApi.create(serverUrl).updateCamera("Bearer $token", id, req)
                _message.value = "Camera updated"
                _cameras.value = NvrApi.create(serverUrl).getCameras("Bearer $token")
            } catch (e: Exception) { _message.value = "Update camera failed: ${e.message}" }
        }
    }

    fun deleteCamera(serverUrl: String, token: String, id: Int) {
        viewModelScope.launch {
            try {
                NvrApi.create(serverUrl).deleteCamera("Bearer $token", id)
                _cameras.value = _cameras.value.filter { it.id != id }
                _message.value = "Camera deleted"
            } catch (e: Exception) { _message.value = "Delete camera failed: ${e.message}" }
        }
    }

    // ── Group CRUD ─────────────────────────────────────────────────────────────

    fun createGroup(serverUrl: String, token: String, name: String) {
        viewModelScope.launch {
            try {
                NvrApi.create(serverUrl).createGroup("Bearer $token", GroupRequest(name))
                _groups.value = NvrApi.create(serverUrl).getGroups("Bearer $token")
            } catch (e: Exception) { _message.value = "Create group failed: ${e.message}" }
        }
    }

    fun updateGroup(serverUrl: String, token: String, id: Int, name: String, cameraIds: List<Int>) {
        viewModelScope.launch {
            try {
                NvrApi.create(serverUrl).updateGroup("Bearer $token", id, GroupRequest(name, cameraIds))
                _groups.value = NvrApi.create(serverUrl).getGroups("Bearer $token")
            } catch (e: Exception) { _message.value = "Update group failed: ${e.message}" }
        }
    }

    fun deleteGroup(serverUrl: String, token: String, id: Int) {
        viewModelScope.launch {
            try {
                NvrApi.create(serverUrl).deleteGroup("Bearer $token", id)
                _groups.value = _groups.value.filter { it.id != id }
            } catch (e: Exception) { _message.value = "Delete group failed: ${e.message}" }
        }
    }

    // ── User CRUD ──────────────────────────────────────────────────────────────

    fun createUser(serverUrl: String, token: String, req: UserRequest) {
        viewModelScope.launch {
            try {
                NvrApi.create(serverUrl).createUser("Bearer $token", req)
                _message.value = "User created"
                _users.value = NvrApi.create(serverUrl).getUsers("Bearer $token")
            } catch (e: Exception) { _message.value = "Create user failed: ${e.message}" }
        }
    }

    fun updateUser(serverUrl: String, token: String, id: Int, req: UserRequest) {
        viewModelScope.launch {
            try {
                NvrApi.create(serverUrl).updateUser("Bearer $token", id, req)
                _message.value = "User updated"
                _users.value = NvrApi.create(serverUrl).getUsers("Bearer $token")
            } catch (e: Exception) { _message.value = "Update user failed: ${e.message}" }
        }
    }

    fun deleteUser(serverUrl: String, token: String, id: Int) {
        viewModelScope.launch {
            try {
                NvrApi.create(serverUrl).deleteUser("Bearer $token", id)
                _users.value = _users.value.filter { it.id != id }
            } catch (e: Exception) { _message.value = "Delete user failed: ${e.message}" }
        }
    }

    // ── API Token management ───────────────────────────────────────────────────

    fun generateToken(serverUrl: String, token: String, name: String) {
        viewModelScope.launch {
            try {
                val result = NvrApi.create(serverUrl).generateApiToken("Bearer $token", ApiTokenRequest(name))
                _newlyGeneratedToken.value = result.token
                _apiTokens.value = NvrApi.create(serverUrl).getApiTokens("Bearer $token")
            } catch (e: Exception) { _message.value = "Generate token failed: ${e.message}" }
        }
    }

    fun revokeToken(serverUrl: String, token: String, tokenVal: String) {
        viewModelScope.launch {
            try {
                NvrApi.create(serverUrl).revokeApiToken("Bearer $token", tokenVal)
                _apiTokens.value = _apiTokens.value.filter { it.token != tokenVal }
                _message.value = "Token revoked"
            } catch (e: Exception) { _message.value = "Revoke failed: ${e.message}" }
        }
    }

    fun clearMessage() { _message.value = null }
    fun clearNewToken() { _newlyGeneratedToken.value = null }
}
