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
    // Simple alphanumeric input — join codes are uppercase alphanumeric
    // Using a compact grid of common characters
    val rows = listOf(
        listOf("1", "2", "3", "A", "B"),
        listOf("4", "5", "6", "C", "D"),
        listOf("7", "8", "9", "E", "F"),
        listOf("0", "G", "H", "X", "⌫")
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
                        else -> ({ onDigit(key) })
                    }
                    Button(
                        onClick = onClick,
                        modifier = Modifier.size(36.dp),
                        colors = ButtonDefaults.buttonColors(
                            backgroundColor = if (key == "⌫") Color(0xFF475569) else Color(0xFF1E293B)
                        )
                    ) {
                        Text(
                            text = key,
                            fontSize = 11.sp,
                            color = Color.White,
                            textAlign = TextAlign.Center
                        )
                    }
                }
            }
        }
    }
}
