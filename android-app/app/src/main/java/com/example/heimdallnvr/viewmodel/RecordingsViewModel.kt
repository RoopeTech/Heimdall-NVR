package com.example.heimdallnvr.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.heimdallnvr.api.NvrApi
import com.example.heimdallnvr.data.Event
import com.example.heimdallnvr.data.Recording
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.format.DateTimeFormatter

class RecordingsViewModel : ViewModel() {

    private val _recordings = MutableStateFlow<List<Recording>>(emptyList())
    val recordings: StateFlow<List<Recording>> = _recordings

    private val _events = MutableStateFlow<List<Event>>(emptyList())
    val events: StateFlow<List<Event>> = _events

    private val _isLoading = MutableStateFlow(false)
    val isLoading: StateFlow<Boolean> = _isLoading

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error

    private val _selectedRecording = MutableStateFlow<Recording?>(null)
    val selectedRecording: StateFlow<Recording?> = _selectedRecording

    val selectedDate = MutableStateFlow(LocalDate.now())
    val selectedCameraId = MutableStateFlow<Int?>(null)

    private val fmt = DateTimeFormatter.ofPattern("yyyy-MM-dd")

    fun load(serverUrl: String, token: String) {
        viewModelScope.launch {
            _isLoading.value = true
            _error.value = null
            val auth = "Bearer $token"
            val api = NvrApi.create(serverUrl)
            val dateStr = selectedDate.value.format(fmt)
            val camId = selectedCameraId.value
            try {
                val rJobs = launch {
                    _recordings.value = api.getRecordings(auth, camId, dateStr)
                }
                val eJobs = launch {
                    try { _events.value = api.getEvents(auth, camId, dateStr) }
                    catch (_: Exception) { _events.value = emptyList() }
                }
                rJobs.join(); eJobs.join()
            } catch (e: Exception) {
                _error.value = "Failed to load recordings: ${e.message}"
            } finally {
                _isLoading.value = false
            }
        }
    }

    fun selectRecording(r: Recording?) { _selectedRecording.value = r }
}
