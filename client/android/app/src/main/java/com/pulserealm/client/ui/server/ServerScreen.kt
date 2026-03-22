package com.pulserealm.client.ui.server

import android.app.RemoteInput
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
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
import androidx.compose.ui.graphics.Color
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
import com.pulserealm.client.data.network.DiscoveredServer
import com.pulserealm.client.ui.components.WearTextInputButton
import com.pulserealm.client.ui.theme.PulseColors
import kotlinx.coroutines.delay
import androidx.compose.foundation.layout.Column

@Composable
fun ServerScreen(
    onConnected: (serverUrl: String) -> Unit,
    viewModel: ServerViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()

    LaunchedEffect(uiState.isConnected) {
        if (uiState.isConnected) {
            onConnected(uiState.serverUrl)
        }
    }

    if (uiState.isVerifyingServer) {
        ConnectingScreen()
    } else {
        ServerConfigContent(viewModel = viewModel)
    }
}

@Composable
private fun ConnectingScreen() {
    Scaffold(
        timeText = { TimeText() },
        vignette = { Vignette(vignettePosition = VignettePosition.TopAndBottom) }
    ) {
        Box(
            modifier = Modifier.fillMaxSize(),
            contentAlignment = Alignment.Center
        ) {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                CircularProgressIndicator(
                    modifier = Modifier.size(24.dp),
                    indicatorColor = PulseColors.Cyan
                )
                Text(
                    text = "Connecting...",
                    color = PulseColors.MutedText,
                    style = MaterialTheme.typography.caption3,
                    textAlign = TextAlign.Center
                )
            }
        }
    }
}

@Composable
private fun ServerConfigContent(viewModel: ServerViewModel) {
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
                        color = PulseColors.Cyan,
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
                                backgroundColor = if (uiState.connectionMode == ConnectionMode.LOCAL) PulseColors.Cyan else PulseColors.DarkSurface
                            )
                        ) {
                            Text(
                                text = "Local",
                                color = if (uiState.connectionMode == ConnectionMode.LOCAL) Color.Black else PulseColors.MutedText,
                                fontSize = 11.sp
                            )
                        }
                        Button(
                            onClick = { viewModel.setConnectionMode(ConnectionMode.REMOTE) },
                            modifier = Modifier.weight(1f),
                            colors = ButtonDefaults.buttonColors(
                                backgroundColor = if (uiState.connectionMode == ConnectionMode.REMOTE) PulseColors.Cyan else PulseColors.DarkSurface
                            )
                        ) {
                            Text(
                                text = "Remote",
                                color = if (uiState.connectionMode == ConnectionMode.REMOTE) Color.Black else PulseColors.MutedText,
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
                                backgroundColor = PulseColors.Cyan
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
                            indicatorColor = PulseColors.Cyan
                        )
                    }
                    item {
                        Text(
                            text = "Searching for server...",
                            color = PulseColors.MutedText,
                            style = MaterialTheme.typography.caption3,
                            textAlign = TextAlign.Center
                        )
                    }
                    if (scanAttempt > 1) {
                        item {
                            Text(
                                text = "Attempt $scanAttempt",
                                color = PulseColors.DimText,
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
                            color = PulseColors.Red,
                            style = MaterialTheme.typography.caption3,
                            textAlign = TextAlign.Center
                        )
                    }
                    item {
                        Button(
                            onClick = { viewModel.scanForServers() },
                            modifier = Modifier.fillMaxWidth(0.8f),
                            colors = ButtonDefaults.buttonColors(
                                backgroundColor = PulseColors.Cyan
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
                                backgroundColor = PulseColors.DarkSurface
                            )
                        ) {
                            Text(
                                text = if (uiState.showManualEntry) "Hide Manual Entry" else "Enter Manually",
                                color = PulseColors.MutedText,
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
                                    backgroundColor = PulseColors.Cyan
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
                                backgroundColor = PulseColors.DarkSurface
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
                            color = PulseColors.ErrorBg,
                            shape = RoundedCornerShape(16.dp)
                        )
                        .padding(horizontal = 12.dp, vertical = 6.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = errorText,
                        color = PulseColors.ErrorText,
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
            backgroundColor = PulseColors.DarkGreen
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
