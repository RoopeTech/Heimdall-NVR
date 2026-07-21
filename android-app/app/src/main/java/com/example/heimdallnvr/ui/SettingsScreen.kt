package com.example.heimdallnvr.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.heimdallnvr.data.*
import com.example.heimdallnvr.theme.*
import com.example.heimdallnvr.viewmodel.SettingsViewModel

private val TAB_LABELS = listOf("System", "Cameras", "Groups", "Users", "API Tokens", "Updates")

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    serverUrl: String,
    apiToken: String,
    isAdmin: Boolean,
    modifier: Modifier = Modifier,
    viewModel: SettingsViewModel = viewModel()
) {
    val settings by viewModel.settings.collectAsStateWithLifecycle()
    val cameras by viewModel.cameras.collectAsStateWithLifecycle()
    val groups by viewModel.groups.collectAsStateWithLifecycle()
    val users by viewModel.users.collectAsStateWithLifecycle()
    val apiTokens by viewModel.apiTokens.collectAsStateWithLifecycle()
    val updateStatus by viewModel.updateStatus.collectAsStateWithLifecycle()
    val isLoading by viewModel.isLoading.collectAsStateWithLifecycle()
    val message by viewModel.message.collectAsStateWithLifecycle()
    val newlyGeneratedToken by viewModel.newlyGeneratedToken.collectAsStateWithLifecycle()
    val isCheckingUpdate by viewModel.isCheckingUpdate.collectAsStateWithLifecycle()
    val isApplyingUpdate by viewModel.isApplyingUpdate.collectAsStateWithLifecycle()

    LaunchedEffect(Unit) { viewModel.loadAll(serverUrl, apiToken, isAdmin) }

    // Snackbar
    val snackbarHostState = remember { SnackbarHostState() }
    LaunchedEffect(message) {
        message?.let { msg ->
            snackbarHostState.showSnackbar(msg)
            viewModel.clearMessage()
        }
    }

    // Newly generated token dialog
    if (newlyGeneratedToken != null) {
        AlertDialog(
            onDismissRequest = { viewModel.clearNewToken() },
            title = { Text("API Token Generated", color = OnDarkSlate) },
            text = {
                Column {
                    Text("Copy this token now — it will not be shown again.",
                        color = StatusError, style = MaterialTheme.typography.bodySmall)
                    Spacer(Modifier.height(12.dp))
                    Surface(shape = RoundedCornerShape(8.dp), color = DarkSlate) {
                        Text(
                            text = newlyGeneratedToken ?: "",
                            modifier = Modifier.padding(12.dp),
                            style = MaterialTheme.typography.bodyMedium,
                            color = NeonOrange,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }
            },
            confirmButton = {
                TextButton(onClick = { viewModel.clearNewToken() }) { Text("Done") }
            },
            containerColor = DarkSlateElevated
        )
    }

    val tabs = if (isAdmin) TAB_LABELS else listOf("System")
    var selectedTab by remember { mutableStateOf(0) }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbarHostState) },
        containerColor = DarkSlate
    ) { padding ->
        Column(modifier = Modifier.fillMaxSize().padding(padding)) {
            // Tab row
            ScrollableTabRow(
                selectedTabIndex = selectedTab,
                containerColor = DarkSlateElevated,
                contentColor = NeonOrange,
                edgePadding = 0.dp
            ) {
                tabs.forEachIndexed { index, label ->
                    Tab(
                        selected = selectedTab == index,
                        onClick = { selectedTab = index },
                        text = { Text(label, style = MaterialTheme.typography.labelMedium) }
                    )
                }
            }

            if (isLoading) {
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = NeonOrange)
                }
                return@Column
            }

            when (tabs.getOrNull(selectedTab)) {
                "System"     -> SystemSettingsTab(
                    settings = settings,
                    onSave = { patch -> viewModel.saveSettings(serverUrl, apiToken, patch) },
                    onTestNotification = { req -> viewModel.testNotification(serverUrl, apiToken, req) }
                )
                "Cameras"    -> CamerasTab(
                    cameras = cameras,
                    onAdd    = { req -> viewModel.addCamera(serverUrl, apiToken, req) },
                    onUpdate = { id, req -> viewModel.updateCamera(serverUrl, apiToken, id, req) },
                    onDelete = { id -> viewModel.deleteCamera(serverUrl, apiToken, id) }
                )
                "Groups"     -> GroupsTab(
                    groups = groups, cameras = cameras,
                    onCreate = { name -> viewModel.createGroup(serverUrl, apiToken, name) },
                    onUpdate = { id, name, ids -> viewModel.updateGroup(serverUrl, apiToken, id, name, ids) },
                    onDelete = { id -> viewModel.deleteGroup(serverUrl, apiToken, id) }
                )
                "Users"      -> UsersTab(
                    users = users,
                    onCreate = { req -> viewModel.createUser(serverUrl, apiToken, req) },
                    onUpdate = { id, req -> viewModel.updateUser(serverUrl, apiToken, id, req) },
                    onDelete = { id -> viewModel.deleteUser(serverUrl, apiToken, id) }
                )
                "API Tokens" -> ApiTokensTab(
                    tokens = apiTokens,
                    onGenerate = { name -> viewModel.generateToken(serverUrl, apiToken, name) },
                    onRevoke   = { tok -> viewModel.revokeToken(serverUrl, apiToken, tok) }
                )
                "Updates"    -> UpdatesTab(
                    updateStatus = updateStatus,
                    isChecking = isCheckingUpdate,
                    isApplying = isApplyingUpdate,
                    onCheck  = { viewModel.checkUpdate(serverUrl, apiToken) },
                    onApply  = { viewModel.applyUpdate(serverUrl, apiToken) }
                )
            }
        }
    }
}

// ── System Settings Tab ────────────────────────────────────────────────────────

@Composable
private fun SystemSettingsTab(
    settings: SystemSettings?,
    onSave: (Map<String, String>) -> Unit,
    onTestNotification: (NotificationTestRequest) -> Unit
) {
    if (settings == null) return
    var appTitle by remember(settings) { mutableStateOf(settings.appTitle) }
    var retentionDays by remember(settings) { mutableStateOf(settings.retentionDays) }
    var discordWebhook by remember(settings) { mutableStateOf(settings.discordWebhookUrl) }
    var telegramToken by remember(settings) { mutableStateOf(settings.telegramBotToken) }
    var telegramChatId by remember(settings) { mutableStateOf(settings.telegramChatId) }
    var notifService by remember(settings) { mutableStateOf(settings.notificationService) }
    var notifMedia by remember(settings) { mutableStateOf(settings.notificationMedia) }
    var useWebrtc by remember(settings) { mutableStateOf(settings.useWebrtc == "1") }

    Column(
        modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        SettingsSection("General") {
            SettingsField("App Title", appTitle) { appTitle = it }
            SettingsField("Retention Days (0 = forever)", retentionDays) { retentionDays = it }
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Enable WebRTC Streaming", color = OnDarkSlate, modifier = Modifier.weight(1f))
                Switch(checked = useWebrtc, onCheckedChange = { useWebrtc = it },
                    colors = SwitchDefaults.colors(checkedThumbColor = NeonOrange,
                        checkedTrackColor = NeonOrange.copy(alpha = 0.4f)))
            }
        }

        SettingsSection("Notifications") {
            SettingsField("Discord Webhook URL", discordWebhook) { discordWebhook = it }
            SettingsField("Telegram Bot Token", telegramToken) { telegramToken = it }
            SettingsField("Telegram Chat ID", telegramChatId) { telegramChatId = it }

            val serviceOptions = listOf("both" to "Both", "discord" to "Discord Only", "telegram" to "Telegram Only")
            DropdownSetting("Notification Service", notifService, serviceOptions) { notifService = it }

            val mediaOptions = listOf("both" to "Picture & Video", "image" to "Image Only", "video" to "Video Only")
            DropdownSetting("Notification Media", notifMedia, mediaOptions) { notifMedia = it }

            Button(
                onClick = {
                    onTestNotification(NotificationTestRequest(
                        discordWebhookUrl = discordWebhook.ifBlank { null },
                        telegramBotToken = telegramToken.ifBlank { null },
                        telegramChatId = telegramChatId.ifBlank { null },
                        notificationService = notifService,
                        notificationMedia = notifMedia
                    ))
                },
                colors = ButtonDefaults.buttonColors(containerColor = DarkSlateElevated,
                    contentColor = NeonOrange),
                modifier = Modifier.fillMaxWidth()
            ) {
                Icon(Icons.Default.Notifications, null)
                Spacer(Modifier.width(8.dp))
                Text("Test Notifications")
            }
        }

        Button(
            onClick = {
                onSave(buildMap {
                    put("app_title", appTitle)
                    put("retention_days", retentionDays)
                    put("use_webrtc", if (useWebrtc) "1" else "0")
                    put("discord_webhook_url", discordWebhook)
                    put("telegram_bot_token", telegramToken)
                    put("telegram_chat_id", telegramChatId)
                    put("notification_service", notifService)
                    put("notification_media", notifMedia)
                })
            },
            modifier = Modifier.fillMaxWidth().height(52.dp),
            shape = RoundedCornerShape(12.dp),
            colors = ButtonDefaults.buttonColors(containerColor = NeonOrange, contentColor = Color.Black)
        ) {
            Icon(Icons.Default.Save, null)
            Spacer(Modifier.width(8.dp))
            Text("Save Settings", fontWeight = FontWeight.Bold)
        }
    }
}

// ── Cameras Tab ────────────────────────────────────────────────────────────────

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun CamerasTab(
    cameras: List<Camera>,
    onAdd: (CameraRequest) -> Unit,
    onUpdate: (Int, CameraRequest) -> Unit,
    onDelete: (Int) -> Unit
) {
    var showForm by remember { mutableStateOf(false) }
    var editingCamera by remember { mutableStateOf<Camera?>(null) }

    if (showForm || editingCamera != null) {
        CameraFormDialog(
            initial = editingCamera,
            onDismiss = { showForm = false; editingCamera = null },
            onSave = { req ->
                val ec = editingCamera
                if (ec != null) onUpdate(ec.id, req) else onAdd(req)
                showForm = false; editingCamera = null
            }
        )
    }

    Column(modifier = Modifier.fillMaxSize()) {
        // Add button
        Box(modifier = Modifier.fillMaxWidth().padding(16.dp)) {
            Button(
                onClick = { showForm = true },
                modifier = Modifier.align(Alignment.CenterEnd),
                colors = ButtonDefaults.buttonColors(containerColor = NeonOrange, contentColor = Color.Black)
            ) {
                Icon(Icons.Default.Add, null)
                Spacer(Modifier.width(6.dp))
                Text("Add Camera")
            }
        }

        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 0.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            items(cameras) { cam ->
                ListItemCard(
                    title = cam.name,
                    subtitle = cam.mainUrl,
                    badge = cam.recordModeLabel,
                    onEdit = { editingCamera = cam },
                    onDelete = { onDelete(cam.id) }
                )
            }
        }
    }
}

// ── Groups Tab ────────────────────────────────────────────────────────────────

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun GroupsTab(
    groups: List<Group>,
    cameras: List<Camera>,
    onCreate: (String) -> Unit,
    onUpdate: (Int, String, List<Int>) -> Unit,
    onDelete: (Int) -> Unit
) {
    var newGroupName by remember { mutableStateOf("") }
    var expandedGroupId by remember { mutableStateOf<Int?>(null) }

    Column(
        modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        // Create group
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedTextField(
                value = newGroupName, onValueChange = { newGroupName = it },
                label = { Text("New Group Name") },
                modifier = Modifier.weight(1f),
                singleLine = true,
                colors = outlinedFieldColors()
            )
            Button(
                onClick = { if (newGroupName.isNotBlank()) { onCreate(newGroupName); newGroupName = "" } },
                colors = ButtonDefaults.buttonColors(containerColor = NeonOrange, contentColor = Color.Black)
            ) { Icon(Icons.Default.Add, null) }
        }

        HorizontalDivider(color = OnDarkSlate.copy(alpha = 0.1f))

        groups.forEach { group ->
            var groupName by remember(group.id, group.name) { mutableStateOf(group.name) }
            val selectedIds = remember(group.id, group.cameraIds) {
                mutableStateListOf<Int>().also { it.addAll(group.cameraIds) }
            }
            val expanded = expandedGroupId == group.id

            Card(colors = CardDefaults.cardColors(containerColor = DarkSlateElevated),
                shape = RoundedCornerShape(12.dp)) {
                Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(group.name, color = OnDarkSlate, fontWeight = FontWeight.SemiBold,
                            modifier = Modifier.weight(1f))
                        IconButton(onClick = { expandedGroupId = if (expanded) null else group.id }) {
                            Icon(if (expanded) Icons.Default.ExpandLess else Icons.Default.ExpandMore,
                                null, tint = NeonOrange)
                        }
                        IconButton(onClick = { onDelete(group.id) }) {
                            Icon(Icons.Default.Delete, null, tint = StatusError)
                        }
                    }
                    if (expanded) {
                        OutlinedTextField(value = groupName, onValueChange = { groupName = it },
                            label = { Text("Group Name") }, singleLine = true,
                            modifier = Modifier.fillMaxWidth(), colors = outlinedFieldColors())
                        Text("Cameras in group:", style = MaterialTheme.typography.labelMedium, color = OnDarkSlate.copy(alpha = 0.6f))
                        cameras.forEach { cam ->
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Checkbox(
                                    checked = selectedIds.contains(cam.id),
                                    onCheckedChange = { checked ->
                                        if (checked) selectedIds.add(cam.id)
                                        else selectedIds.remove(cam.id)
                                    },
                                    colors = CheckboxDefaults.colors(checkedColor = NeonOrange)
                                )
                                Text(cam.name, color = OnDarkSlate)
                            }
                        }
                        Button(
                            onClick = { onUpdate(group.id, groupName, selectedIds.toList()) },
                            modifier = Modifier.fillMaxWidth(),
                            colors = ButtonDefaults.buttonColors(containerColor = NeonOrange, contentColor = Color.Black)
                        ) { Text("Save Group") }
                    }
                }
            }
        }
    }
}

// ── Users Tab ─────────────────────────────────────────────────────────────────

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun UsersTab(
    users: List<User>,
    onCreate: (UserRequest) -> Unit,
    onUpdate: (Int, UserRequest) -> Unit,
    onDelete: (Int) -> Unit
) {
    var showForm by remember { mutableStateOf(false) }
    var editingUser by remember { mutableStateOf<User?>(null) }

    if (showForm || editingUser != null) {
        UserFormDialog(
            initial = editingUser,
            onDismiss = { showForm = false; editingUser = null },
            onSave = { req ->
                val eu = editingUser
                if (eu != null) onUpdate(eu.id, req) else onCreate(req)
                showForm = false; editingUser = null
            }
        )
    }

    Column(modifier = Modifier.fillMaxSize()) {
        Box(modifier = Modifier.fillMaxWidth().padding(16.dp)) {
            Button(
                onClick = { showForm = true },
                modifier = Modifier.align(Alignment.CenterEnd),
                colors = ButtonDefaults.buttonColors(containerColor = NeonOrange, contentColor = Color.Black)
            ) {
                Icon(Icons.Default.PersonAdd, null); Spacer(Modifier.width(6.dp)); Text("Add User")
            }
        }
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            items(users) { user ->
                ListItemCard(
                    title = user.username,
                    subtitle = user.role,
                    badge = if (user.role == "admin") "ADMIN" else "VIEWER",
                    onEdit = { editingUser = user },
                    onDelete = { onDelete(user.id) }
                )
            }
        }
    }
}

// ── API Tokens Tab ─────────────────────────────────────────────────────────────

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ApiTokensTab(
    tokens: List<ApiToken>,
    onGenerate: (String) -> Unit,
    onRevoke: (String) -> Unit
) {
    var newTokenName by remember { mutableStateOf("") }

    Column(
        modifier = Modifier.fillMaxSize().padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedTextField(
                value = newTokenName, onValueChange = { newTokenName = it },
                label = { Text("Token Name") }, singleLine = true,
                modifier = Modifier.weight(1f), colors = outlinedFieldColors()
            )
            Button(
                onClick = { if (newTokenName.isNotBlank()) { onGenerate(newTokenName); newTokenName = "" } },
                colors = ButtonDefaults.buttonColors(containerColor = NeonOrange, contentColor = Color.Black)
            ) { Text("Generate") }
        }
        HorizontalDivider(color = OnDarkSlate.copy(alpha = 0.1f))
        LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            items(tokens) { tok ->
                ListItemCard(
                    title = tok.name,
                    subtitle = tok.token.take(12) + "…",
                    badge = null,
                    onEdit = null,
                    onDelete = { onRevoke(tok.token) }
                )
            }
        }
    }
}

// ── Updates Tab ───────────────────────────────────────────────────────────────

@Composable
private fun UpdatesTab(
    updateStatus: UpdateStatus?,
    isChecking: Boolean,
    isApplying: Boolean,
    onCheck: () -> Unit,
    onApply: () -> Unit
) {
    Column(
        modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        Button(
            onClick = onCheck, enabled = !isChecking && !isApplying,
            modifier = Modifier.fillMaxWidth().height(52.dp),
            shape = RoundedCornerShape(12.dp),
            colors = ButtonDefaults.buttonColors(containerColor = DarkSlateElevated, contentColor = NeonOrange)
        ) {
            if (isChecking) CircularProgressIndicator(Modifier.size(18.dp), NeonOrange, 2.dp)
            else { Icon(Icons.Default.Refresh, null); Spacer(Modifier.width(8.dp)); Text("Check for Updates") }
        }

        updateStatus?.let { status ->
            Card(colors = CardDefaults.cardColors(containerColor = DarkSlateElevated),
                shape = RoundedCornerShape(12.dp)) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    InfoRow("Current Version", status.localVersion)
                    InfoRow("Latest Version", status.remoteVersion)
                    InfoRow("Local Commit", status.localCommit)
                    InfoRow("Remote Commit", status.remoteCommit)
                    if (status.error != null) {
                        Text(status.error, color = StatusError, style = MaterialTheme.typography.bodySmall)
                    }
                }
            }
            if (status.updateAvailable) {
                Button(
                    onClick = onApply, enabled = !isApplying,
                    modifier = Modifier.fillMaxWidth().height(52.dp),
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = NeonOrange, contentColor = Color.Black)
                ) {
                    if (isApplying) CircularProgressIndicator(Modifier.size(18.dp), Color.Black, 2.dp)
                    else { Icon(Icons.Default.SystemUpdate, null); Spacer(Modifier.width(8.dp))
                           Text("Apply Update", fontWeight = FontWeight.Bold) }
                }
                if (status.changelog.isNotBlank()) {
                    Text("Changelog:", color = OnDarkSlate, fontWeight = FontWeight.SemiBold)
                    Surface(shape = RoundedCornerShape(8.dp), color = DarkSlate) {
                        Text(status.changelog.take(1000),
                            modifier = Modifier.padding(12.dp),
                            style = MaterialTheme.typography.bodySmall, color = OnDarkSlate.copy(alpha = 0.8f))
                    }
                }
            } else if (!status.updateAvailable && status.error == null) {
                Surface(shape = RoundedCornerShape(8.dp), color = StatusLive.copy(alpha = 0.15f)) {
                    Row(Modifier.fillMaxWidth().padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.CheckCircle, null, tint = StatusLive)
                        Spacer(Modifier.width(8.dp))
                        Text("You are up to date!", color = StatusLive)
                    }
                }
            }
        }
    }
}

// ── Camera Form Dialog ─────────────────────────────────────────────────────────

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun CameraFormDialog(
    initial: Camera?,
    onDismiss: () -> Unit,
    onSave: (CameraRequest) -> Unit
) {
    var name by remember(initial) { mutableStateOf(initial?.name ?: "") }
    var mainUrl by remember(initial) { mutableStateOf(initial?.mainUrl ?: "") }
    var subUrl by remember(initial) { mutableStateOf(initial?.subUrl ?: "") }
    var recordMode by remember(initial) { mutableStateOf(initial?.recordMode ?: "motion") }
    var rtspUser by remember(initial) { mutableStateOf(initial?.rtspUser ?: "") }
    var rtspPass by remember(initial) { mutableStateOf(initial?.rtspPass ?: "") }
    var ptzEnabled by remember(initial) { mutableStateOf(initial?.ptzEnabled ?: false) }

    val recordModes = listOf("motion" to "Motion Only", "always" to "Always Record (24/7)",
        "hybrid" to "Hybrid", "view_only" to "View Only")

    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = DarkSlateElevated,
        title = { Text(if (initial != null) "Edit Camera" else "Add Camera", color = OnDarkSlate) },
        text = {
            Column(
                modifier = Modifier.verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                SettingsField("Camera Name", name) { name = it }
                SettingsField("Main Stream URL (RTSP)", mainUrl) { mainUrl = it }
                SettingsField("Sub Stream URL (RTSP)", subUrl) { subUrl = it }
                SettingsField("RTSP Username", rtspUser) { rtspUser = it }
                SettingsField("RTSP Password", rtspPass) { rtspPass = it }
                DropdownSetting("Record Mode", recordMode, recordModes) { recordMode = it }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("PTZ Enabled", color = OnDarkSlate, modifier = Modifier.weight(1f))
                    Switch(checked = ptzEnabled, onCheckedChange = { ptzEnabled = it },
                        colors = SwitchDefaults.colors(checkedThumbColor = NeonOrange,
                            checkedTrackColor = NeonOrange.copy(alpha = 0.4f)))
                }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    onSave(CameraRequest(
                        name = name, mainUrl = mainUrl, subUrl = subUrl,
                        recordMode = recordMode,
                        rtspUser = rtspUser.ifBlank { null },
                        rtspPass = rtspPass.ifBlank { null },
                        ptzEnabled = ptzEnabled
                    ))
                },
                enabled = name.isNotBlank() && mainUrl.isNotBlank(),
                colors = ButtonDefaults.buttonColors(containerColor = NeonOrange, contentColor = Color.Black)
            ) { Text("Save") }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancel", color = OnDarkSlate.copy(alpha = 0.6f)) }
        }
    )
}

// ── User Form Dialog ───────────────────────────────────────────────────────────

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun UserFormDialog(
    initial: User?,
    onDismiss: () -> Unit,
    onSave: (UserRequest) -> Unit
) {
    var username by remember(initial) { mutableStateOf(initial?.username ?: "") }
    var password by remember { mutableStateOf("") }
    var role by remember(initial) { mutableStateOf(initial?.role ?: "viewer") }
    val roleOptions = listOf("viewer" to "Viewer", "admin" to "Admin")

    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = DarkSlateElevated,
        title = { Text(if (initial != null) "Edit User" else "Add User", color = OnDarkSlate) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                SettingsField("Username", username) { username = it }
                OutlinedTextField(
                    value = password, onValueChange = { password = it },
                    label = { Text(if (initial != null) "New Password (blank = keep)" else "Password") },
                    visualTransformation = PasswordVisualTransformation(),
                    singleLine = true, modifier = Modifier.fillMaxWidth(), colors = outlinedFieldColors()
                )
                DropdownSetting("Role", role, roleOptions) { role = it }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    onSave(UserRequest(username = username,
                        password = password.ifBlank { null }, role = role))
                },
                enabled = username.isNotBlank() && (initial != null || password.isNotBlank()),
                colors = ButtonDefaults.buttonColors(containerColor = NeonOrange, contentColor = Color.Black)
            ) { Text("Save") }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancel", color = OnDarkSlate.copy(alpha = 0.6f)) }
        }
    )
}

// ── Reusable components ────────────────────────────────────────────────────────

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun SettingsSection(title: String, content: @Composable ColumnScope.() -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(title, color = NeonOrange, fontWeight = FontWeight.Bold,
            style = MaterialTheme.typography.labelLarge)
        Card(colors = CardDefaults.cardColors(containerColor = DarkSlateElevated),
            shape = RoundedCornerShape(12.dp)) {
            Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                content()
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun SettingsField(label: String, value: String, onValueChange: (String) -> Unit) {
    OutlinedTextField(
        value = value, onValueChange = onValueChange, label = { Text(label) },
        singleLine = true, modifier = Modifier.fillMaxWidth(), colors = outlinedFieldColors()
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun DropdownSetting(
    label: String,
    current: String,
    options: List<Pair<String, String>>,
    onSelect: (String) -> Unit
) {
    var expanded by remember { mutableStateOf(false) }
    val currentLabel = options.find { it.first == current }?.second ?: current
    Box {
        OutlinedTextField(
            value = currentLabel, onValueChange = {}, readOnly = true, label = { Text(label) },
            trailingIcon = { Icon(Icons.Default.ArrowDropDown, null, tint = NeonOrange) },
            modifier = Modifier.fillMaxWidth().clickable { expanded = true },
            colors = outlinedFieldColors()
        )
        DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false },
            containerColor = DarkSlateElevated) {
            options.forEach { (value, label) ->
                DropdownMenuItem(text = { Text(label, color = OnDarkSlate) },
                    onClick = { onSelect(value); expanded = false })
            }
        }
    }
}

@Composable
private fun ListItemCard(
    title: String,
    subtitle: String,
    badge: String?,
    onEdit: (() -> Unit)?,
    onDelete: () -> Unit
) {
    Card(colors = CardDefaults.cardColors(containerColor = DarkSlateElevated),
        shape = RoundedCornerShape(10.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(title, color = OnDarkSlate, fontWeight = FontWeight.SemiBold)
                    if (badge != null) {
                        Surface(shape = RoundedCornerShape(4.dp), color = NeonOrange.copy(alpha = 0.2f)) {
                            Text(badge, modifier = Modifier.padding(horizontal = 5.dp, vertical = 2.dp),
                                style = MaterialTheme.typography.labelSmall, color = NeonOrange)
                        }
                    }
                }
                Text(subtitle, color = OnDarkSlate.copy(alpha = 0.5f),
                    style = MaterialTheme.typography.bodySmall, maxLines = 1)
            }
            if (onEdit != null) {
                IconButton(onClick = onEdit) {
                    Icon(Icons.Default.Edit, null, tint = NeonOrange)
                }
            }
            IconButton(onClick = onDelete) {
                Icon(Icons.Default.Delete, null, tint = StatusError)
            }
        }
    }
}

@Composable
private fun InfoRow(label: String, value: String) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, color = OnDarkSlate.copy(alpha = 0.6f), style = MaterialTheme.typography.bodySmall)
        Text(value, color = OnDarkSlate, style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.SemiBold)
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun outlinedFieldColors() = TextFieldDefaults.colors(
    focusedContainerColor = Color.Transparent,
    unfocusedContainerColor = Color.Transparent,
    focusedIndicatorColor = NeonOrange,
    unfocusedIndicatorColor = OnDarkSlate.copy(alpha = 0.25f),
    focusedLabelColor = NeonOrange,
    cursorColor = NeonOrange,
    focusedTextColor = OnDarkSlate,
    unfocusedTextColor = OnDarkSlate
)
