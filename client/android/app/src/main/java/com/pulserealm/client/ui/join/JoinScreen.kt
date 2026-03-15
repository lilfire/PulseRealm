package com.pulserealm.client.ui.join

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import android.app.RemoteInput
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.wear.compose.foundation.lazy.ScalingLazyColumn
import androidx.wear.compose.foundation.lazy.rememberScalingLazyListState
import androidx.wear.compose.material.Button
import androidx.wear.compose.material.ButtonDefaults
import androidx.wear.compose.material.CircularProgressIndicator
import androidx.wear.compose.material.MaterialTheme
import androidx.wear.compose.material.Scaffold
import androidx.wear.compose.material.Text
import androidx.wear.compose.material.TimeText
import androidx.wear.compose.material.Vignette
import androidx.wear.compose.material.VignettePosition
import androidx.wear.input.RemoteInputIntentHelper
import com.pulserealm.client.data.network.ConnectionState
import com.pulserealm.client.data.network.DiscoveredServer
import kotlinx.coroutines.delay

@Composable
fun JoinScreen(
    onJoined: (realmId: String, clientId: String, serverUrl: String) -> Unit,
    viewModel: JoinViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    val connectionState by viewModel.connectionState.collectAsState()

    // Navigate when joined
    if (uiState.isJoined && uiState.realmInfo != null) {
        onJoined(
            uiState.realmInfo!!.id,
            uiState.clientId,
            uiState.serverUrl
        )
        return
    }

    if (uiState.showServerConfig) {
        ServerConfigScreen(viewModel = viewModel)
    } else {
        JoinCodeScreen(
            uiState = uiState,
            connectionState = connectionState,
            viewModel = viewModel
        )
    }
}

@Composable
private fun ServerConfigScreen(viewModel: JoinViewModel) {
    val uiState by viewModel.uiState.collectAsState()
    val discoveredServers by viewModel.discoveredServers.collectAsState()
    val isScanning by viewModel.isScanning.collectAsState()
    val scanAttempt by viewModel.scanAttempt.collectAsState()

    val listState = rememberScalingLazyListState()

    // Toast-style error message
    var showError by remember { mutableStateOf(false) }
    var errorText by remember { mutableStateOf("") }

    LaunchedEffect(uiState.errorMessage) {
        if (uiState.errorMessage != null) {
            errorText = uiState.errorMessage!!
            showError = true
            delay(3000)
            showError = false
        } else {
            showError = false
        }
    }

    Scaffold(
        timeText = { TimeText() },
        vignette = { Vignette(vignettePosition = VignettePosition.TopAndBottom) }
    ) {
        Box(modifier = Modifier.fillMaxSize()) {
        ScalingLazyColumn(
            modifier = Modifier.fillMaxSize(),
            state = listState,
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            item {
                Text(
                    text = "Server",
                    style = MaterialTheme.typography.title2,
                    color = Color(0xFF38BDF8),
                    textAlign = TextAlign.Center
                )
            }

            // Mode toggle
            item {
                Row(
                    modifier = Modifier.fillMaxWidth(0.9f),
                    horizontalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    Button(
                        onClick = { viewModel.setConnectionMode(ConnectionMode.LOCAL) },
                        modifier = Modifier.weight(1f),
                        colors = ButtonDefaults.buttonColors(
                            backgroundColor = if (uiState.connectionMode == ConnectionMode.LOCAL) Color(0xFF38BDF8) else Color(0xFF1E293B)
                        )
                    ) {
                        Text(
                            text = "Local",
                            color = if (uiState.connectionMode == ConnectionMode.LOCAL) Color.Black else Color(0xFF94A3B8),
                            fontSize = 11.sp
                        )
                    }
                    Button(
                        onClick = { viewModel.setConnectionMode(ConnectionMode.REMOTE) },
                        modifier = Modifier.weight(1f),
                        colors = ButtonDefaults.buttonColors(
                            backgroundColor = if (uiState.connectionMode == ConnectionMode.REMOTE) Color(0xFF38BDF8) else Color(0xFF1E293B)
                        )
                    ) {
                        Text(
                            text = "Remote",
                            color = if (uiState.connectionMode == ConnectionMode.REMOTE) Color.Black else Color(0xFF94A3B8),
                            fontSize = 11.sp
                        )
                    }
                }
            }

            if (uiState.connectionMode == ConnectionMode.REMOTE) {
                // Remote mode — URL entry via RemoteInput
                item {
                    val launcher = rememberLauncherForActivityResult(
                        ActivityResultContracts.StartActivityForResult()
                    ) { result ->
                        val data = result.data ?: return@rememberLauncherForActivityResult
                        val results = RemoteInput.getResultsFromIntent(data)
                        val url = results.getCharSequence("remote_url")?.toString() ?: return@rememberLauncherForActivityResult
                        viewModel.updateRemoteUrl(url)
                    }
                    WearTextInputButton(
                        label = "Server address",
                        value = uiState.remoteUrl,
                        placeholder = "server.example.com",
                        onClick = {
                            val intent = RemoteInputIntentHelper.createActionRemoteInputIntent()
                            val remoteInput = RemoteInput.Builder("remote_url")
                                .setLabel("Server address")
                                .build()
                            RemoteInputIntentHelper.putRemoteInputsExtra(intent, listOf(remoteInput))
                            launcher.launch(intent)
                        }
                    )
                }
                item {
                    Button(
                        onClick = { viewModel.confirmServer() },
                        modifier = Modifier.fillMaxWidth(0.7f),
                        colors = ButtonDefaults.buttonColors(
                            backgroundColor = Color(0xFF38BDF8)
                        ),
                        enabled = uiState.remoteUrl.isNotBlank() && !uiState.isLoading
                    ) {
                        if (uiState.isLoading) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(14.dp),
                                indicatorColor = Color.Black
                            )
                        } else {
                            Text(text = "Connect", color = Color.Black, fontSize = 12.sp)
                        }
                    }
                }
            } else if (isScanning) {
                // Local mode — scanning
                item {
                    CircularProgressIndicator(
                        modifier = Modifier.size(24.dp),
                        indicatorColor = Color(0xFF38BDF8)
                    )
                }
                item {
                    Text(
                        text = "Searching for server...",
                        color = Color(0xFF94A3B8),
                        style = MaterialTheme.typography.caption3,
                        textAlign = TextAlign.Center
                    )
                }
                if (scanAttempt > 1) {
                    item {
                        Text(
                            text = "Attempt $scanAttempt",
                            color = Color(0xFF64748B),
                            style = MaterialTheme.typography.caption3,
                            textAlign = TextAlign.Center
                        )
                    }
                }
            } else if (discoveredServers.isEmpty()) {
                // Local mode — no servers found
                item {
                    Text(
                        text = "No server found",
                        color = Color(0xFFF87171),
                        style = MaterialTheme.typography.caption3,
                        textAlign = TextAlign.Center
                    )
                }
                item {
                    Button(
                        onClick = { viewModel.scanForServers() },
                        modifier = Modifier.fillMaxWidth(0.8f),
                        colors = ButtonDefaults.buttonColors(
                            backgroundColor = Color(0xFF38BDF8)
                        )
                    ) {
                        Text(
                            text = "Retry Search",
                            color = Color.Black,
                            fontSize = 12.sp
                        )
                    }
                }
                // Manual entry button (for local IPs)
                item {
                    Button(
                        onClick = { viewModel.toggleManualEntry() },
                        modifier = Modifier.fillMaxWidth(0.8f),
                        colors = ButtonDefaults.buttonColors(
                            backgroundColor = Color(0xFF1E293B)
                        )
                    ) {
                        Text(
                            text = if (uiState.showManualEntry) "Hide Manual Entry" else "Enter Manually",
                            color = Color(0xFF94A3B8),
                            fontSize = 11.sp
                        )
                    }
                }

                // Manual entry via RemoteInput
                if (uiState.showManualEntry) {
                    item {
                        val launcher = rememberLauncherForActivityResult(
                            ActivityResultContracts.StartActivityForResult()
                        ) { result ->
                            val data = result.data ?: return@rememberLauncherForActivityResult
                            val results = RemoteInput.getResultsFromIntent(data)
                            val url = results.getCharSequence("server_url")?.toString() ?: return@rememberLauncherForActivityResult
                            viewModel.updateServerUrl(url)
                        }
                        WearTextInputButton(
                            label = "Server address",
                            value = uiState.serverUrl,
                            placeholder = "192.168.1.x:5062",
                            onClick = {
                                val intent = RemoteInputIntentHelper.createActionRemoteInputIntent()
                                val remoteInput = RemoteInput.Builder("server_url")
                                    .setLabel("Server address")
                                    .build()
                                RemoteInputIntentHelper.putRemoteInputsExtra(intent, listOf(remoteInput))
                                launcher.launch(intent)
                            }
                        )
                    }
                    // Confirm button
                    item {
                        Button(
                            onClick = { viewModel.confirmServer() },
                            modifier = Modifier.fillMaxWidth(0.7f),
                            colors = ButtonDefaults.buttonColors(
                                backgroundColor = Color(0xFF38BDF8)
                            ),
                            enabled = uiState.serverUrl.isNotBlank()
                        ) {
                            Text(text = "OK", color = Color.Black)
                        }
                    }
                }
            } else {
                // Local mode — discovered servers
                item {
                    Button(
                        onClick = { viewModel.scanForServers() },
                        modifier = Modifier.fillMaxWidth(0.8f),
                        colors = ButtonDefaults.buttonColors(
                            backgroundColor = Color(0xFF1E293B)
                        )
                    ) {
                        Text(
                            text = "Scan Again",
                            color = Color.White,
                            fontSize = 12.sp
                        )
                    }
                }
            }

            // Show discovered servers list (local mode only)
            if (uiState.connectionMode == ConnectionMode.LOCAL) {
                for (server in discoveredServers) {
                    item {
                        DiscoveredServerItem(
                            server = server,
                            onClick = { viewModel.selectDiscoveredServer(server) }
                        )
                    }
                }
            }

        }

        // Toast overlay
        AnimatedVisibility(
            visible = showError,
            enter = fadeIn(),
            exit = fadeOut(),
            modifier = Modifier
                .align(Alignment.Center)
        ) {
            Box(
                modifier = Modifier
                    .padding(horizontal = 12.dp)
                    .background(
                        color = Color(0xDD7F1D1D),
                        shape = RoundedCornerShape(16.dp)
                    )
                    .padding(horizontal = 12.dp, vertical = 6.dp),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = errorText,
                    color = Color(0xFFFECACA),
                    fontSize = 12.sp,
                    textAlign = TextAlign.Center,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis
                )
            }
        }
        }
    }
}

@Composable
private fun DiscoveredServerItem(
    server: DiscoveredServer,
    onClick: () -> Unit
) {
    Button(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth(0.85f),
        colors = ButtonDefaults.buttonColors(
            backgroundColor = Color(0xFF166534)
        )
    ) {
        Text(
            text = "${server.name}\n${server.address.hostAddress}",
            color = Color.White,
            fontSize = 11.sp,
            textAlign = TextAlign.Center,
            lineHeight = 14.sp
        )
    }
}

@OptIn(androidx.compose.foundation.ExperimentalFoundationApi::class)
@Composable
private fun JoinCodeScreen(
    uiState: JoinUiState,
    connectionState: ConnectionState,
    viewModel: JoinViewModel
) {
    val pagerState = rememberPagerState(initialPage = 0, pageCount = { 2 })

    Scaffold(
        timeText = { TimeText() },
        vignette = { Vignette(vignettePosition = VignettePosition.TopAndBottom) }
    ) {
        HorizontalPager(
            state = pagerState,
            modifier = Modifier.fillMaxSize()
        ) { page ->
            when (page) {
                0 -> JoinPage(
                    uiState = uiState,
                    connectionState = connectionState,
                    viewModel = viewModel
                )
                1 -> SettingsPage(
                    uiState = uiState,
                    viewModel = viewModel
                )
            }
        }
    }
}

@Composable
private fun JoinPage(
    uiState: JoinUiState,
    connectionState: ConnectionState,
    viewModel: JoinViewModel
) {
    // Toast-style error message
    var showError by remember { mutableStateOf(false) }
    var errorText by remember { mutableStateOf("") }

    LaunchedEffect(uiState.errorMessage) {
        if (uiState.errorMessage != null) {
            errorText = uiState.errorMessage!!
            showError = true
            delay(3000)
            showError = false
        } else {
            showError = false
        }
    }

    BoxWithConstraints(
        modifier = Modifier.fillMaxSize(),
        contentAlignment = Alignment.Center
    ) {
        val availableHeight = maxHeight
        val availableWidth = maxWidth
        // Code display gets ~8% of height, numpad gets the rest
        val codeHeight = availableHeight * 0.14f
        val padHeight = availableHeight * 0.62f
        // Numpad is 4 rows, each button is square — calculate button size from available space
        val padSpacing = 2.dp
        val buttonSize = minOf(
            (padHeight - padSpacing * 3) / 4,  // fit 4 rows
            (availableWidth - padSpacing * 2) / 3, // fit 3 columns
            36.dp                                   // hard cap for small screens
        )
        val fontSize = buttonSize * 0.38f

        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(top = availableHeight * 0.08f, bottom = availableHeight * 0.02f),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            // Join code display
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp)
                    .height(codeHeight),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = if (uiState.joinCode.isNotEmpty()) uiState.joinCode else "------",
                    style = MaterialTheme.typography.title1.copy(
                        fontFamily = FontFamily.Monospace,
                        letterSpacing = 4.sp
                    ),
                    color = Color.White,
                    textAlign = TextAlign.Center
                )
            }

            // Number pad or loading
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f),
                contentAlignment = Alignment.Center
            ) {
                if (uiState.isLoading) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(buttonSize),
                        indicatorColor = Color(0xFF38BDF8)
                    )
                } else {
                    NumberPad(
                        buttonSize = buttonSize,
                        fontSize = fontSize,
                        onDigit = { digit ->
                            if (uiState.joinCode.length < 6) {
                                viewModel.updateJoinCode(uiState.joinCode + digit)
                            }
                        },
                        onDelete = {
                            if (uiState.joinCode.isNotEmpty()) {
                                viewModel.updateJoinCode(uiState.joinCode.dropLast(1))
                            }
                        },
                        onConfirm = {
                            if (uiState.joinCode.length == 6) {
                                viewModel.join()
                            } else {
                                viewModel.updateJoinCode("")
                            }
                        },
                        canJoin = uiState.joinCode.length == 6
                    )
                }
            }
        }

        // Toast overlay
        AnimatedVisibility(
            visible = showError,
            enter = fadeIn(),
            exit = fadeOut(),
            modifier = Modifier.align(Alignment.Center)
        ) {
            Box(
                modifier = Modifier
                    .padding(horizontal = 12.dp)
                    .background(
                        color = Color(0xDD7F1D1D),
                        shape = RoundedCornerShape(16.dp)
                    )
                    .padding(horizontal = 12.dp, vertical = 6.dp),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = errorText,
                    color = Color(0xFFFECACA),
                    fontSize = 12.sp,
                    textAlign = TextAlign.Center,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis
                )
            }
        }
    }
}

@Composable
private fun SettingsPage(
    uiState: JoinUiState,
    viewModel: JoinViewModel
) {
    val listState = rememberScalingLazyListState()

    ScalingLazyColumn(
        modifier = Modifier.fillMaxSize(),
        state = listState,
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(6.dp)
    ) {
        item {
            Text(
                text = "Settings",
                style = MaterialTheme.typography.title3,
                color = Color(0xFF38BDF8),
                textAlign = TextAlign.Center
            )
        }

        // Profile fields
        item {
            ProfileField(
                label = "Name",
                value = uiState.playerName,
                onValueChange = { viewModel.updatePlayerName(it) }
            )
        }
        item {
            ProfileField(
                label = "Height (cm)",
                value = uiState.heightCm,
                onValueChange = { viewModel.updateHeightCm(it) }
            )
        }
        item {
            ProfileField(
                label = "Weight (kg)",
                value = uiState.weightKg,
                onValueChange = { viewModel.updateWeightKg(it) }
            )
        }

        // Server info + change
        item {
            Text(
                text = uiState.serverUrl.removePrefix("http://"),
                color = Color(0xFF64748B),
                fontSize = 10.sp,
                textAlign = TextAlign.Center,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }
        item {
            Button(
                onClick = { viewModel.changeServer() },
                modifier = Modifier.fillMaxWidth(0.85f),
                colors = ButtonDefaults.buttonColors(
                    backgroundColor = Color(0xFF1E293B)
                )
            ) {
                Text(
                    text = "Change Server",
                    color = Color(0xFF94A3B8),
                    fontSize = 11.sp,
                    textAlign = TextAlign.Center
                )
            }
        }

        // Version
        item {
            Text(
                text = "v${com.pulserealm.client.BuildConfig.VERSION_NAME}",
                color = Color(0xFF475569),
                style = MaterialTheme.typography.caption3,
                textAlign = TextAlign.Center
            )
        }
    }
}

@Composable
private fun ProfileField(
    label: String,
    value: String,
    onValueChange: (String) -> Unit
) {
    val key = label.lowercase().replace(" ", "_")
    val launcher = rememberLauncherForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        val data = result.data ?: return@rememberLauncherForActivityResult
        val results = RemoteInput.getResultsFromIntent(data)
        val newValue = results.getCharSequence(key)?.toString() ?: return@rememberLauncherForActivityResult
        onValueChange(newValue)
    }

    WearTextInputButton(
        label = label,
        value = value,
        placeholder = "---",
        modifier = Modifier.fillMaxWidth(0.85f),
        onClick = {
            val intent = RemoteInputIntentHelper.createActionRemoteInputIntent()
            val remoteInput = RemoteInput.Builder(key)
                .setLabel(label)
                .build()
            RemoteInputIntentHelper.putRemoteInputsExtra(intent, listOf(remoteInput))
            launcher.launch(intent)
        }
    )
}

@Composable
private fun WearTextInputButton(
    label: String,
    value: String,
    placeholder: String,
    modifier: Modifier = Modifier.fillMaxWidth(0.9f),
    onClick: () -> Unit
) {
    Column(
        modifier = modifier,
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        Text(
            text = label,
            color = Color(0xFF94A3B8),
            style = MaterialTheme.typography.caption3,
            textAlign = TextAlign.Center
        )
        Button(
            onClick = onClick,
            modifier = Modifier
                .fillMaxWidth()
                .height(36.dp),
            colors = ButtonDefaults.buttonColors(
                backgroundColor = Color(0xFF1E293B)
            )
        ) {
            Text(
                text = value.ifEmpty { placeholder },
                color = if (value.isEmpty()) Color(0xFF475569) else Color.White,
                fontSize = 13.sp,
                fontFamily = FontFamily.Monospace,
                textAlign = TextAlign.Center,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }
    }
}

@Composable
private fun NumberPad(
    buttonSize: Dp,
    fontSize: Dp,
    onDigit: (String) -> Unit,
    onDelete: () -> Unit,
    onConfirm: () -> Unit,
    canJoin: Boolean
) {
    val rows = listOf(
        listOf("1", "2", "3"),
        listOf("4", "5", "6"),
        listOf("7", "8", "9"),
        listOf("\u232B", "0", "\u2713")
    )
    val textSize = with(LocalDensity.current) { fontSize.toSp() }

    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(2.dp)
    ) {
        for (row in rows) {
            Row(
                horizontalArrangement = Arrangement.spacedBy(2.dp)
            ) {
                for (key in row) {
                    val onClick: () -> Unit = when (key) {
                        "\u232B" -> onDelete
                        "\u2713" -> onConfirm
                        else -> ({ onDigit(key) })
                    }
                    Button(
                        onClick = onClick,
                        modifier = Modifier.size(buttonSize),
                        colors = ButtonDefaults.buttonColors(
                            backgroundColor = when (key) {
                                "\u232B" -> Color(0xFF475569)
                                "\u2713" -> if (canJoin) Color(0xFF38BDF8) else Color(0xFF475569)
                                else -> Color(0xFF1E293B)
                            }
                        )
                    ) {
                        Text(
                            text = key,
                            fontSize = textSize,
                            color = if (key == "\u2713" && canJoin) Color.Black else Color.White,
                            textAlign = TextAlign.Center
                        )
                    }
                }
            }
        }
    }
}
