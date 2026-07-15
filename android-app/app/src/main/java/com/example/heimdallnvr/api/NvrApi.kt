package com.example.heimdallnvr.api

import com.example.heimdallnvr.data.*
import com.jakewharton.retrofit2.converter.kotlinx.serialization.asConverterFactory
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import retrofit2.Retrofit
import retrofit2.http.*
import java.util.concurrent.TimeUnit

// ── Shared HTTP client with sane timeouts ─────────────────────────────────────

val sharedOkHttpClient: OkHttpClient = OkHttpClient.Builder()
    .connectTimeout(10, TimeUnit.SECONDS)
    .readTimeout(15, TimeUnit.SECONDS)
    .writeTimeout(10, TimeUnit.SECONDS)
    .build()

// ── Retrofit interface ────────────────────────────────────────────────────────

interface NvrApi {

    // Auth
    @POST("/api/auth/login")
    suspend fun login(@Body request: LoginRequest): LoginResponse

    @GET("/api/auth/me")
    suspend fun getMe(@Header("Authorization") token: String): User

    @POST("/api/auth/logout")
    suspend fun logout(@Header("Authorization") token: String): SimpleResponse

    @POST("/api/auth/change_password")
    suspend fun changePassword(
        @Header("Authorization") token: String,
        @Body request: ChangePasswordRequest
    ): SimpleResponse

    // Cameras
    @GET("/api/cameras")
    suspend fun getCameras(@Header("Authorization") token: String): List<Camera>

    @GET("/api/cameras/{id}")
    suspend fun getCamera(
        @Header("Authorization") token: String,
        @Path("id") cameraId: Int
    ): Camera

    @POST("/api/cameras")
    suspend fun addCamera(
        @Header("Authorization") token: String,
        @Body request: CameraRequest
    ): IdResponse

    @PUT("/api/cameras/{id}")
    suspend fun updateCamera(
        @Header("Authorization") token: String,
        @Path("id") cameraId: Int,
        @Body request: CameraRequest
    ): SimpleResponse

    @DELETE("/api/cameras/{id}")
    suspend fun deleteCamera(
        @Header("Authorization") token: String,
        @Path("id") cameraId: Int
    ): SimpleResponse

    @POST("/api/cameras/{id}/restart")
    suspend fun restartCamera(
        @Header("Authorization") token: String,
        @Path("id") cameraId: Int
    ): SimpleResponse

    @POST("/api/cameras/{id}/record")
    suspend fun triggerManualRecord(
        @Header("Authorization") token: String,
        @Path("id") cameraId: Int
    ): SimpleResponse

    @POST("/api/cameras/{id}/ptz")
    suspend fun ptzControl(
        @Header("Authorization") token: String,
        @Path("id") cameraId: Int,
        @Body request: PtzRequest
    ): SimpleResponse

    // Groups
    @GET("/api/groups")
    suspend fun getGroups(@Header("Authorization") token: String): List<Group>

    @POST("/api/groups")
    suspend fun createGroup(
        @Header("Authorization") token: String,
        @Body request: GroupRequest
    ): Group

    @PUT("/api/groups/{id}")
    suspend fun updateGroup(
        @Header("Authorization") token: String,
        @Path("id") groupId: Int,
        @Body request: GroupRequest
    ): SimpleResponse

    @DELETE("/api/groups/{id}")
    suspend fun deleteGroup(
        @Header("Authorization") token: String,
        @Path("id") groupId: Int
    ): SimpleResponse

    // Recordings
    @GET("/api/recordings")
    suspend fun getRecordings(
        @Header("Authorization") token: String,
        @Query("camera_id") cameraId: Int? = null,
        @Query("date") date: String? = null
    ): List<Recording>

    // Events
    @GET("/api/events")
    suspend fun getEvents(
        @Header("Authorization") token: String,
        @Query("camera_id") cameraId: Int? = null,
        @Query("date") date: String? = null,
        @Query("limit") limit: Int = 500
    ): List<Event>

    // Settings
    @GET("/api/settings")
    suspend fun getSettings(@Header("Authorization") token: String): SystemSettings

    @POST("/api/settings")
    suspend fun saveSettings(
        @Header("Authorization") token: String,
        @Body settings: Map<String, String>
    ): SimpleResponse

    @POST("/api/settings/test-notification")
    suspend fun testNotification(
        @Header("Authorization") token: String,
        @Body request: NotificationTestRequest
    ): SimpleResponse

    @GET("/api/settings/check_update")
    suspend fun checkUpdate(@Header("Authorization") token: String): UpdateStatus

    @POST("/api/settings/apply_update")
    suspend fun applyUpdate(@Header("Authorization") token: String): SimpleResponse

    // Users
    @GET("/api/users")
    suspend fun getUsers(@Header("Authorization") token: String): List<User>

    @POST("/api/users")
    suspend fun createUser(
        @Header("Authorization") token: String,
        @Body request: UserRequest
    ): IdResponse

    @PUT("/api/users/{id}")
    suspend fun updateUser(
        @Header("Authorization") token: String,
        @Path("id") userId: Int,
        @Body request: UserRequest
    ): SimpleResponse

    @DELETE("/api/users/{id}")
    suspend fun deleteUser(
        @Header("Authorization") token: String,
        @Path("id") userId: Int
    ): SimpleResponse

    // API Tokens
    @GET("/api/tokens")
    suspend fun getApiTokens(@Header("Authorization") token: String): List<ApiToken>

    @POST("/api/tokens")
    suspend fun generateApiToken(
        @Header("Authorization") token: String,
        @Body request: ApiTokenRequest
    ): GeneratedToken

    @DELETE("/api/tokens/{tokenVal}")
    suspend fun revokeApiToken(
        @Header("Authorization") token: String,
        @Path("tokenVal") tokenVal: String
    ): SimpleResponse

    companion object {
        // Cache instances by base URL to avoid rebuilding Retrofit on every call
        private val instances = mutableMapOf<String, NvrApi>()

        fun create(baseUrl: String): NvrApi {
            val normalizedUrl = if (baseUrl.endsWith("/")) baseUrl else "$baseUrl/"
            return instances.getOrPut(normalizedUrl) {
                val json = Json {
                    ignoreUnknownKeys = true
                    isLenient = true
                }
                val contentType = "application/json".toMediaType()
                Retrofit.Builder()
                    .baseUrl(normalizedUrl)
                    .client(sharedOkHttpClient)
                    .addConverterFactory(json.asConverterFactory(contentType))
                    .build()
                    .create(NvrApi::class.java)
            }
        }

        /** Call when the server URL changes so a fresh instance is created. */
        fun invalidate(baseUrl: String) {
            val normalizedUrl = if (baseUrl.endsWith("/")) baseUrl else "$baseUrl/"
            instances.remove(normalizedUrl)
        }
    }
}
