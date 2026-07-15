package com.example.heimdallnvr.api

import com.example.heimdallnvr.data.Camera
import com.example.heimdallnvr.data.PtzRequest
import com.example.heimdallnvr.data.SimpleResponse
import com.jakewharton.retrofit2.converter.kotlinx.serialization.asConverterFactory
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import retrofit2.Retrofit
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Header

interface NvrApi {
    @GET("/api/cameras")
    suspend fun getCameras(@Header("Authorization") token: String): List<Camera>

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

    companion object {
        fun create(baseUrl: String): NvrApi {
            val json = Json { ignoreUnknownKeys = true }
            val contentType = "application/json".toMediaType()
            val retrofit = Retrofit.Builder()
                .baseUrl(if (baseUrl.endsWith("/")) baseUrl else "$baseUrl/")
                .client(OkHttpClient.Builder().build())
                .addConverterFactory(json.asConverterFactory(contentType))
                .build()

            return retrofit.create(NvrApi::class.java)
        }
    }
}
