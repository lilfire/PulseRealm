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
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
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
import com.pulserealm.client.data.network.ConnectionState
import com.pulserealm.client.data.network.DiscoveredServer

@Composable
fun JoinScreen(
    onJoined: (sessionId: String, clientId: String, serverUrl: String) -> Unit,
    viewModel: JoinViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    val connectionState by viewModel.connectionState.collectAsState()

    // Navigate when joined
    if (uiState.isJoined && uiState.sessionInfo != null) {
        onJoined(
            uiState.sessionInfo!!.id,
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

    Scaffold(
        timeText = { TimeText() },
        vignette = { Vignette(vignettePosition = VignettePosition.TopAndBottom) }
    ) {
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

            if (isScanning) {
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
                // No servers found
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
                // Manual entry button
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

                // Manual entry with on-screen keyboard
                if (uiState.showManualEntry) {
                    item {
                        Column(
                            modifier = Modifier.fillMaxWidth(0.9f),
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(4.dp)
                        ) {
                            Text(
                                text = "Server address",
                                color = Color(0xFF94A3B8),
                                style = MaterialTheme.typography.caption3,
                                textAlign = TextAlign.Center
                            )
                            BasicTextField(
                                value = uiState.serverUrl,
                                onValueChange = { viewModel.updateServerUrl(it) },
                                textStyle = TextStyle(
                                    color = Color.White,
                                    fontSize = 13.sp,
                                    fontFamily = FontFamily.Monospace,
                                    textAlign = TextAlign.Center
                                ),
                                cursorBrush = SolidColor(Color(0xFF38BDF8)),
                                keyboardOptions = KeyboardOptions(
                                    keyboardType = KeyboardType.Uri,
                                    imeAction = ImeAction.Done
                                ),
                                keyboardActions = KeyboardActions(
                                    onDone = { viewModel.confirmServer() }
                                ),
                                singleLine = true,
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .height(36.dp)
                                    .padding(horizontal = 4.dp),
                                decorationBox = { innerTextField ->
                                    Box(
                                        modifier = Modifier.fillMaxSize(),
                                        contentAlignment = Alignment.Center
                                    ) {
                                        if (uiState.serverUrl.isEmpty()) {
                                            Text(
                                                text = "http://...",
                                                color = Color(0xFF475569),
                                                fontSize = 13.sp,
                                                fontFamily = FontFamily.Monospace,
                                                textAlign = TextAlign.Center
                                            )
                                        }
                                        innerTextField()
                                    }
                                }
                            )
                        }
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
                // Discovered servers
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

            // Show discovered servers list
            for (server in discoveredServers) {
                item {
                    DiscoveredServerItem(
                        server = server,
                        onClick = { viewModel.selectDiscoveredServer(server) }
                    )
                }
            }

            // Error
            if (uiState.errorMessage != null) {
                item {
                    Text(
                        text = uiState.errorMessage!!,
                        color = Color(0xFFF87171),
                        style = MaterialTheme.typography.caption3,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.padding(horizontal = 16.dp)
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
    BoxWithConstraints(
        modifier = Modifier.fillMaxSize(),
        contentAlignment = Alignment.Center
    ) {
        val availableHeight = maxHeight
        val availableWidth = maxWidth
        // Code display gets ~8% of height, numpad gets ~85%, error gets ~7%
        val codeHeight = availableHeight * 0.08f
        val padHeight = availableHeight * 0.85f
        // Numpad is 4 rows, each button is square — calculate button size from available space
        val padSpacing = 2.dp
        val buttonSize = minOf(
            (padHeight - padSpacing * 3) / 4,  // fit 4 rows
            (availableWidth - padSpacing * 2) / 3  // fit 3 columns
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

            // Error message
            if (uiState.errorMessage != null) {
                Text(
                    text = uiState.errorMessage!!,
                    color = Color(0xFFF87171),
                    fontSize = 13.sp,
                    textAlign = TextAlign.Center,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp)
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
                onValueChange = { viewModel.updatePlayerName(it) },
                keyboardType = KeyboardType.Text
            )
        }
        item {
            ProfileField(
                label = "Height (cm)",
                value = uiState.heightCm,
                onValueChange = { viewModel.updateHeightCm(it) },
                keyboardType = KeyboardType.Number
            )
        }
        item {
            ProfileField(
                label = "Weight (kg)",
                value = uiState.weightKg,
                onValueChange = { viewModel.updateWeightKg(it) },
                keyboardType = KeyboardType.Number
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
    onValueChange: (String) -> Unit,
    keyboardType: KeyboardType
) {
    Column(
        modifier = Modifier.fillMaxWidth(0.85f),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(
            text = label,
            color = Color(0xFF94A3B8),
            style = MaterialTheme.typography.caption3,
            textAlign = TextAlign.Center
        )
        BasicTextField(
            value = value,
            onValueChange = onValueChange,
            textStyle = TextStyle(
                color = Color.White,
                fontSize = 14.sp,
                textAlign = TextAlign.Center
            ),
            cursorBrush = SolidColor(Color(0xFF38BDF8)),
            keyboardOptions = KeyboardOptions(keyboardType = keyboardType),
            singleLine = true,
            modifier = Modifier
                .fillMaxWidth()
                .height(32.dp)
                .padding(horizontal = 8.dp),
            decorationBox = { innerTextField ->
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center
                ) {
                    if (value.isEmpty()) {
                        Text(
                            text = "---",
                            color = Color(0xFF475569),
                            fontSize = 14.sp,
                            textAlign = TextAlign.Center
                        )
                    }
                    innerTextField()
                }
            }
        )
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
