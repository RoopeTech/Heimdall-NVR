package com.example.heimdallnvr.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.heimdallnvr.api.NvrApi
import com.example.heimdallnvr.data.Event
import com.example.heimdallnvr.data.PtzRequest
import com.example.heimdallnvr.data.Recording
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.format.DateTimeFormatter

class CameraDetailViewModel : ViewModel() {

    private val _events = MutableStateFlow<List<Event>>(emptyList())
    val events: StateFlow<List<Event>> = _events

    private val _todayRecordings = MutableStateFlow<List<Recording>>(emptyList())
    val todayRecordings: StateFlow<List<Recording>> = _todayRecordings

    private val _isRecording = MutableStateFlow(false)
    val isRecording: StateFlow<Boolean> = _isRecording

    private val _recordMessage = MutableStateFlow<String?>(null)
    val recordMessage: StateFlow<String?> = _recordMessage

    private val _ptzError = MutableStateFlow<String?>(null)
    val ptzError: StateFlow<String?> = _ptzError

    private var pollingJob: Job? = null
    private val fmt = DateTimeFormatter.ofPattern("yyyy-MM-dd")

    fun startPolling(serverUrl: String, token: String, cameraId: Int) {
        pollingJob?.cancel()
        pollingJob = viewModelScope.launch {
            while (isActive) {
                val today = LocalDate.now().format(fmt)
                val auth = "Bearer $token"
                val api = NvrApi.create(serverUrl)
                try {
                    val evts = api.getEvents(auth, cameraId, today)
                    _events.value = evts
                } catch (_: Exception) {}
                try {
                    val recs = api.getRecordings(auth, cameraId, today)
                    _todayRecordings.value = recs
                } catch (_: Exception) {}
                delay(3_000L) // poll every 3 seconds like web UI
            }
        }
    }

    fun stopPolling() { pollingJob?.cancel() }

    fun triggerRecord(serverUrl: String, token: String, cameraId: Int) {
        viewModelScope.launch {
            _isRecording.value = true
            try {
                val resp = NvrApi.create(serverUrl).triggerManualRecord("Bearer $token", cameraId)
                _recordMessage.value = if (resp.success) "Recording 15s clip…" else resp.message
            } catch (e: Exception) {
                _recordMessage.value = "Record failed: ${e.message}"
            } finally {
                _isRecording.value = false
                delay(3000)
                _recordMessage.value = null
            }
        }
    }

    fun sendPtz(serverUrl: String, token: String, cameraId: Int, request: PtzRequest) {
        viewModelScope.launch {
            try {
                NvrApi.create(serverUrl).ptzControl("Bearer $token", cameraId, request)
            } catch (e: Exception) {
                _ptzError.value = e.message
            }
        }
    }

    override fun onCleared() {
        super.onCleared()
        pollingJob?.cancel()
    }
}
