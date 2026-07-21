package com.example.heimdallnvr.repo

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.example.heimdallnvr.api.NvrApi
import com.example.heimdallnvr.data.LoginRequest
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.map

val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "settings")

class AuthRepository(private val context: Context) {
    private val SERVER_URL_KEY  = stringPreferencesKey("server_url")
    private val SESSION_TOKEN_KEY = stringPreferencesKey("api_token")   // key name kept for compatibility
    private val USERNAME_KEY    = stringPreferencesKey("username")
    private val ROLE_KEY        = stringPreferencesKey("role")

    val serverUrl: Flow<String?> = context.dataStore.data.map { it[SERVER_URL_KEY] }
    val sessionToken: Flow<String?> = context.dataStore.data.map { it[SESSION_TOKEN_KEY] }
    val username: Flow<String?> = context.dataStore.data.map { it[USERNAME_KEY] }
    val role: Flow<String?> = context.dataStore.data.map { it[ROLE_KEY] }

    /** True when both server URL and session token are persisted. */
    val isLoggedIn: Flow<Boolean> = combine(serverUrl, sessionToken) { url, token ->
        !url.isNullOrBlank() && !token.isNullOrBlank()
    }

    val isAdmin: Flow<Boolean> = role.map { it == "admin" }

    /**
     * Perform username/password login against the NVR API.
     * Stores the returned session token, username, and role on success.
     * Returns the session token string or throws on failure.
     */
    suspend fun login(serverUrl: String, username: String, password: String): String {
        val api = NvrApi.create(serverUrl)
        val response = api.login(LoginRequest(username, password))
        val token = response.token
        context.dataStore.edit { prefs ->
            prefs[SERVER_URL_KEY]   = serverUrl
            prefs[SESSION_TOKEN_KEY] = token
            prefs[USERNAME_KEY]     = response.user.username
            prefs[ROLE_KEY]         = response.user.role
        }
        return token
    }

    /** Convenience: builds the "Bearer {token}" header value. */
    suspend fun bearerToken(): String? {
        val prefs = context.dataStore.data.map { it[SESSION_TOKEN_KEY] }
        var token: String? = null
        prefs.collect { token = it; }
        return token?.let { "Bearer $it" }
    }

    suspend fun clearAuthData() {
        context.dataStore.edit { prefs ->
            prefs.remove(SERVER_URL_KEY)
            prefs.remove(SESSION_TOKEN_KEY)
            prefs.remove(USERNAME_KEY)
            prefs.remove(ROLE_KEY)
        }
    }
}
