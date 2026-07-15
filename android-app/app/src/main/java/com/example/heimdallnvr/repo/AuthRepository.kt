package com.example.heimdallnvr.repo

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "settings")

class AuthRepository(private val context: Context) {
    private val SERVER_URL_KEY = stringPreferencesKey("server_url")
    private val API_TOKEN_KEY = stringPreferencesKey("api_token")

    val serverUrl: Flow<String?> = context.dataStore.data.map { it[SERVER_URL_KEY] }
    val apiToken: Flow<String?> = context.dataStore.data.map { it[API_TOKEN_KEY] }

    suspend fun saveAuthData(url: String, token: String) {
        context.dataStore.edit { prefs ->
            prefs[SERVER_URL_KEY] = url
            prefs[API_TOKEN_KEY] = token
        }
    }

    suspend fun clearAuthData() {
        context.dataStore.edit { prefs ->
            prefs.remove(SERVER_URL_KEY)
            prefs.remove(API_TOKEN_KEY)
        }
    }
}
