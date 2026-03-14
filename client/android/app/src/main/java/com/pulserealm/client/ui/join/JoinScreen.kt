package com.pulserealm.client.ui.join

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.style.TextAlign
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
                // Scanning state
                item {
                    CircularProgressIndicator(
                        modifier = Modifier.size(24.dp),
                        indicatorColor = Color(0xFF38BDF8)
                    )
                }
                item {
                    Text(
                        text = "Searching for server…",
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
                // Not found state — show retry
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

            // Separator — manual entry always available
            item {
                Text(
                    text = "— or enter address —",
                    color = Color(0xFF64748B),
                    style = MaterialTheme.typography.caption3,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.padding(vertical = 4.dp)
                )
            }

            // Manual URL input hint
            item {
                Text(
                    text = uiState.serverUrl.ifEmpty { "http://..." },
                    style = MaterialTheme.typography.body2.copy(
                        fontFamily = FontFamily.Monospace
                    ),
                    color = if (uiState.serverUrl.isEmpty()) Color(0xFF475569) else Color.White,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth()
                )
            }

            // URL digit-entry: for Wear OS, provide IP input via number pad
            item {
                IpAddressPad(
                    currentUrl = uiState.serverUrl,
                    onUrlChanged = { viewModel.updateServerUrl(it) }
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
            text = "${server.hostname}\n${server.address.hostAddress}",
            color = Color.White,
            fontSize = 11.sp,
            textAlign = TextAlign.Center,
            lineHeight = 14.sp
        )
    }
}

@Composable
private fun IpAddressPad(
    currentUrl: String,
    onUrlChanged: (String) -> Unit
) {
    val keys = listOf(
        listOf("1", "2", "3"),
        listOf("4", "5", "6"),
        listOf("7", "8", "9"),
        listOf(".", "0", "⌫"),
    )

    // If empty, start with http:// prefix
    val effectiveUrl = currentUrl.ifEmpty { "http://" }

    androidx.compose.foundation.layout.Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(2.dp)
    ) {
        for (row in keys) {
            androidx.compose.foundation.layout.Row(
                horizontalArrangement = Arrangement.spacedBy(2.dp)
            ) {
                for (key in row) {
                    val onClick: () -> Unit = when (key) {
                        "⌫" -> ({
                            if (effectiveUrl.length > "http://".length) {
                                onUrlChanged(effectiveUrl.dropLast(1))
                            }
                        })
                        else -> ({ onUrlChanged(effectiveUrl + key) })
                    }
                    Button(
                        onClick = onClick,
                        modifier = Modifier.size(40.dp),
                        colors = ButtonDefaults.buttonColors(
                            backgroundColor = when (key) {
                                "⌫" -> Color(0xFF475569)
                                "." -> Color(0xFF475569)
                                else -> Color(0xFF1E293B)
                            }
                        )
                    ) {
                        Text(
                            text = key,
                            fontSize = 13.sp,
                            color = Color.White,
                            textAlign = TextAlign.Center
                        )
                    }
                }
            }
        }
        // Port shortcut row
        androidx.compose.foundation.layout.Row(
            horizontalArrangement = Arrangement.spacedBy(2.dp)
        ) {
            Button(
                onClick = { onUrlChanged(effectiveUrl + ":") },
                modifier = Modifier.size(width = 40.dp, height = 32.dp),
                colors = ButtonDefaults.buttonColors(backgroundColor = Color(0xFF475569))
            ) {
                Text(text = ":", fontSize = 13.sp, color = Color.White)
            }
            Button(
                onClick = { onUrlChanged(effectiveUrl + ":5062") },
                modifier = Modifier.size(width = 84.dp, height = 32.dp),
                colors = ButtonDefaults.buttonColors(backgroundColor = Color(0xFF1E293B))
            ) {
                Text(text = ":5062", fontSize = 11.sp, color = Color(0xFF38BDF8))
            }
        }
    }
}

@Composable
private fun JoinCodeScreen(
    uiState: JoinUiState,
    connectionState: ConnectionState,
    viewModel: JoinViewModel
) {
    val listState = rememberScalingLazyListState()

    Scaffold(
        timeText = { TimeText() },
        vignette = { Vignette(vignettePosition = VignettePosition.TopAndBottom) }
    ) {
        ScalingLazyColumn(
            modifier = Modifier.fillMaxSize(),
            state = listState,
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            // Title
            item {
                Text(
                    text = "PulseRealm",
                    style = MaterialTheme.typography.title2,
                    color = Color(0xFF38BDF8),
                    textAlign = TextAlign.Center
                )
            }

            // Server info
            item {
                Button(
                    onClick = { viewModel.changeServer() },
                    modifier = Modifier.fillMaxWidth(0.8f),
                    colors = ButtonDefaults.buttonColors(
                        backgroundColor = Color(0xFF1E293B)
                    )
                ) {
                    Text(
                        text = uiState.serverUrl.removePrefix("http://"),
                        color = Color(0xFF64748B),
                        fontSize = 10.sp,
                        textAlign = TextAlign.Center
                    )
                }
            }

            // Join code display
            item {
                Text(
                    text = if (uiState.joinCode.isNotEmpty()) uiState.joinCode else "------",
                    style = MaterialTheme.typography.display3.copy(
                        fontFamily = FontFamily.Monospace,
                        letterSpacing = 4.sp
                    ),
                    color = Color.White,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth()
                )
            }

            // Number pad (3x3 + bottom row)
            item {
                NumberPad(
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
                    onClear = { viewModel.updateJoinCode("") }
                )
            }

            // Join button
            item {
                if (uiState.isLoading) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(32.dp),
                        indicatorColor = Color(0xFF38BDF8)
                    )
                } else {
                    Button(
                        onClick = { viewModel.join() },
                        modifier = Modifier.fillMaxWidth(0.7f),
                        colors = ButtonDefaults.buttonColors(
                            backgroundColor = Color(0xFF38BDF8)
                        ),
                        enabled = uiState.joinCode.length == 6
                    ) {
                        Text(
                            text = "JOIN",
                            color = Color.Black
                        )
                    }
                }
            }

            // Error message
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

            // Connection status
            item {
                val statusText = when (connectionState) {
                    ConnectionState.CONNECTED -> "Connected"
                    ConnectionState.CONNECTING -> "Connecting…"
                    ConnectionState.RECONNECTING -> "Reconnecting…"
                    ConnectionState.DISCONNECTED -> "Ready"
                }
                val statusColor = when (connectionState) {
                    ConnectionState.CONNECTED -> Color(0xFF86EFAC)
                    ConnectionState.CONNECTING, ConnectionState.RECONNECTING -> Color(0xFFFBBF24)
                    ConnectionState.DISCONNECTED -> Color(0xFF64748B)
                }
                Text(
                    text = statusText,
                    color = statusColor,
                    style = MaterialTheme.typography.caption3,
                    textAlign = TextAlign.Center
                )
            }
        }
    }
}

@Composable
private fun NumberPad(
    onDigit: (String) -> Unit,
    onDelete: () -> Unit,
    onClear: () -> Unit
) {
    // Numeric-only input — join codes are 6-digit numeric
    val rows = listOf(
        listOf("1", "2", "3"),
        listOf("4", "5", "6"),
        listOf("7", "8", "9"),
        listOf("⌫", "0", "✓")
    )

    androidx.compose.foundation.layout.Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(2.dp)
    ) {
        for (row in rows) {
            androidx.compose.foundation.layout.Row(
                horizontalArrangement = Arrangement.spacedBy(2.dp)
            ) {
                for (key in row) {
                    val onClick: () -> Unit = when (key) {
                        "⌫" -> onDelete
                        "✓" -> onClear
                        else -> ({ onDigit(key) })
                    }
                    Button(
                        onClick = onClick,
                        modifier = Modifier.size(44.dp),
                        colors = ButtonDefaults.buttonColors(
                            backgroundColor = when (key) {
                                "⌫" -> Color(0xFF475569)
                                "✓" -> Color(0xFF475569)
                                else -> Color(0xFF1E293B)
                            }
                        )
                    ) {
                        Text(
                            text = key,
                            fontSize = 14.sp,
                            color = Color.White,
                            textAlign = TextAlign.Center
                        )
                    }
                }
            }
        }
    }
}
