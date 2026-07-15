package com.example.heimdallnvr.data

import kotlinx.serialization.KSerializer
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.descriptors.PrimitiveKind
import kotlinx.serialization.descriptors.PrimitiveSerialDescriptor
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.JsonDecoder
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonPrimitive

// ── Auth ──────────────────────────────────────────────────────────────────────

@Serializable
data class LoginRequest(val username: String, val password: String)

@Serializable
data class LoginResponse(
    val token: String,
    val user: User
)

@Serializable
data class User(
    val id: Int,
    val username: String,
    val role: String, // "admin" or "viewer"
    @SerialName("default_password_warning") val defaultPasswordWarning: Boolean = false
)

@Serializable
data class ChangePasswordRequest(
    @SerialName("current_password") val currentPassword: String,
    @SerialName("new_password") val newPassword: String
)

// ── Cameras ───────────────────────────────────────────────────────────────────

/**
 * Handles backends that return boolean fields as 0/1 integers instead of JSON true/false.
 * Accepts both "true"/"false" JSON booleans and 0/1 integers transparently.
 */
object BooleanAsIntSerializer : KSerializer<Boolean> {
    override val descriptor: SerialDescriptor =
        PrimitiveSerialDescriptor("BooleanAsInt", PrimitiveKind.INT)

    override fun serialize(encoder: Encoder, value: Boolean) {
        encoder.encodeInt(if (value) 1 else 0)
    }

    override fun deserialize(decoder: Decoder): Boolean {
        // Handle both JSON boolean (true/false) and integer (0/1)
        return if (decoder is JsonDecoder) {
            val element = decoder.decodeJsonElement().jsonPrimitive
            try { element.boolean } catch (_: Exception) { element.int != 0 }
        } else {
            decoder.decodeInt() != 0
        }
    }
}

@Serializable
data class Camera(
    val id: Int,
    val name: String,
    @SerialName("main_url") val mainUrl: String,
    @SerialName("sub_url") val subUrl: String = "",
    @SerialName("record_mode") val recordMode: String = "motion", // motion|always|hybrid|view_only
    @SerialName("stream_type") val streamType: String = "rtsp",   // rtsp|image_url|website
    @SerialName("ptz_enabled") @Serializable(with = BooleanAsIntSerializer::class) val ptzEnabled: Boolean = false,
    @SerialName("ptz_type") val ptzType: String = "onvif",
    @SerialName("rtsp_user") val rtspUser: String? = null,
    @SerialName("rtsp_pass") val rtspPass: String? = null,
    @SerialName("osd_enabled") @Serializable(with = BooleanAsIntSerializer::class) val osdEnabled: Boolean = false,
    @SerialName("motion_enabled") @Serializable(with = BooleanAsIntSerializer::class) val motionEnabled: Boolean = true,
    @SerialName("motion_sensitivity") val motionSensitivity: Int = 50,
    @SerialName("pre_roll") val preRoll: Int = 2,
    @SerialName("post_roll") val postRoll: Int = 10,
    @SerialName("image_url") val imageUrl: String? = null,
    @SerialName("image_refresh_interval") val imageRefreshInterval: Int = 5,
    @SerialName("website_url") val websiteUrl: String? = null,
    @SerialName("archive_path") val archivePath: String? = null,
    @SerialName("archive_days") val archiveDays: Int = 0
) {
    val recordModeLabel: String get() = when (recordMode) {
        "always"    -> "24/7"
        "motion"    -> "MOTION"
        "hybrid"    -> "HYBRID"
        "view_only" -> "VIEW"
        else        -> recordMode.uppercase()
    }
    val isViewOnly: Boolean get() = recordMode == "view_only"
}

@Serializable
data class CameraRequest(
    val name: String,
    @SerialName("main_url") val mainUrl: String,
    @SerialName("sub_url") val subUrl: String = "",
    @SerialName("record_mode") val recordMode: String = "motion",
    @SerialName("stream_type") val streamType: String = "rtsp",
    @SerialName("ptz_enabled") val ptzEnabled: Boolean = false,
    @SerialName("ptz_type") val ptzType: String = "onvif",
    @SerialName("rtsp_user") val rtspUser: String? = null,
    @SerialName("rtsp_pass") val rtspPass: String? = null,
    @SerialName("motion_sensitivity") val motionSensitivity: Int = 50,
    @SerialName("pre_roll") val preRoll: Int = 2,
    @SerialName("post_roll") val postRoll: Int = 10,
    @SerialName("archive_days") val archiveDays: Int = 0,
    @SerialName("archive_path") val archivePath: String? = null
)

// ── PTZ ───────────────────────────────────────────────────────────────────────

@Serializable
data class PtzRequest(
    val action: String,         // "move" | "stop" | "home"
    val pan: Float = 0f,
    val tilt: Float = 0f,
    val zoom: Float = 1f
)

// ── Groups ────────────────────────────────────────────────────────────────────

@Serializable
data class Group(
    val id: Int,
    val name: String,
    @SerialName("camera_ids") val cameraIds: List<Int> = emptyList()
)

@Serializable
data class GroupRequest(
    val name: String,
    @SerialName("camera_ids") val cameraIds: List<Int> = emptyList()
)

// ── Recordings ────────────────────────────────────────────────────────────────

@Serializable
data class Recording(
    val id: Int = 0,
    @SerialName("camera_id") val cameraId: Int,
    // Backend stores as 'filepath' in SQLite, not 'filename'
    @SerialName("filepath") val filename: String,
    @SerialName("start_time") val startTime: String,       // ISO datetime
    @SerialName("end_time") val endTime: String? = null,
    val duration: Double = 0.0,
    @SerialName("is_archived") @Serializable(with = BooleanAsIntSerializer::class) val isArchived: Boolean = false,
    @SerialName("camera_name") val cameraName: String = ""
)

// ── Events ────────────────────────────────────────────────────────────────────

@Serializable
data class Event(
    val id: Int = 0,
    @SerialName("camera_id") val cameraId: Int,
    val timestamp: String,
    val type: String = "motion",           // "motion" | "system"
    @SerialName("clip_filename") val clipFilename: String? = null,
    @SerialName("camera_name") val cameraName: String = ""
)

// ── System Settings ───────────────────────────────────────────────────────────

@Serializable
data class SystemSettings(
    @SerialName("app_title") val appTitle: String = "Heimdall NVR",
    @SerialName("retention_days") val retentionDays: String = "0",
    @SerialName("use_webrtc") val useWebrtc: String = "1",
    @SerialName("discord_webhook_url") val discordWebhookUrl: String = "",
    @SerialName("telegram_bot_token") val telegramBotToken: String = "",
    @SerialName("telegram_chat_id") val telegramChatId: String = "",
    @SerialName("notification_service") val notificationService: String = "both",
    @SerialName("notification_media") val notificationMedia: String = "both",
    @SerialName("git_remote_name") val gitRemoteName: String = "origin"
)

// ── Update ────────────────────────────────────────────────────────────────────

@Serializable
data class UpdateStatus(
    @SerialName("update_available") val updateAvailable: Boolean = false,
    @SerialName("local_version") val localVersion: String = "unknown",
    @SerialName("remote_version") val remoteVersion: String = "unknown",
    @SerialName("local_commit") val localCommit: String = "",
    @SerialName("remote_commit") val remoteCommit: String = "",
    val changelog: String = "",
    val error: String? = null
)

// ── API Tokens ────────────────────────────────────────────────────────────────

@Serializable
data class ApiToken(
    val name: String,
    val token: String = "",
    @SerialName("created_at") val createdAt: String = ""
)

@Serializable
data class ApiTokenRequest(val name: String)

@Serializable
data class GeneratedToken(val token: String)

// ── Generic Responses ─────────────────────────────────────────────────────────

@Serializable
data class SimpleResponse(
    val success: Boolean = false,
    val message: String = ""
)

@Serializable
data class IdResponse(
    val id: Int = 0,
    val message: String = ""
)

// ── User Management ───────────────────────────────────────────────────────────

@Serializable
data class UserRequest(
    val username: String,
    val password: String? = null,
    val role: String = "viewer"
)

// ── Notification Test ─────────────────────────────────────────────────────────

@Serializable
data class NotificationTestRequest(
    @SerialName("discord_webhook_url") val discordWebhookUrl: String? = null,
    @SerialName("telegram_bot_token") val telegramBotToken: String? = null,
    @SerialName("telegram_chat_id") val telegramChatId: String? = null,
    @SerialName("notification_service") val notificationService: String = "both",
    @SerialName("notification_media") val notificationMedia: String = "both"
)
