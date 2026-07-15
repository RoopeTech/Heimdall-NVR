package com.example.heimdallnvr.data

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class Camera(
    val id: Int,
    val name: String,
    @SerialName("main_url") val mainUrl: String,
    @SerialName("sub_url") val subUrl: String,
    @SerialName("record_mode") val recordMode: String,
    @SerialName("stream_type") val streamType: String
)

@Serializable
data class PtzRequest(
    val action: String,
    val pan: Float = 0f,
    val tilt: Float = 0f,
    val zoom: Float = 1f
)

@Serializable
data class SimpleResponse(
    val success: Boolean = false,
    val message: String = ""
)
