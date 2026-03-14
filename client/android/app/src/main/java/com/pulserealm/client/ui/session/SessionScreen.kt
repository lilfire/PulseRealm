package com.pulserealm.client.ui.session

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.wear.compose.foundation.lazy.ScalingLazyColumn
import androidx.wear.compose.foundation.lazy.rememberScalingLazyListState
import androidx.wear.compose.material.Button
import androidx.wear.compose.material.ButtonDefaults
import androidx.wear.compose.material.MaterialTheme
import androidx.wear.compose.material.Scaffold
import androidx.wear.compose.material.Text
import androidx.wear.compose.material.TimeText
import androidx.wear.compose.material.Vignette
import androidx.wear.compose.material.VignettePosition
import com.pulserealm.client.data.network.ConnectionState

@OptIn(androidx.compose.foundation.ExperimentalFoundationApi::class)
@Composable
fun SessionScreen(
    onDisconnected: () -> Unit,
    viewModel: SessionViewModel = hiltViewModel()
) {
    val heartRate by viewModel.heartRate.collectAsState()
    val steps by viewModel.steps.collectAsState()
    val sendCount by viewModel.sendCount.collectAsState()
    val connectionState by viewModel.connectionState.collectAsState()
    val sensorsAvailable by viewModel.sensorsAvailable.collectAsState()

    // Start streaming when screen appears
    DisposableEffect(Unit) {
        viewModel.startStreaming()
        onDispose {
            // Streaming continues in the foreground service
        }
    }

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
                0 -> LivePage(
                    heartRate = heartRate,
                    steps = steps,
                    sendCount = sendCount,
                    connectionState = connectionState,
                    sensorsAvailable = sensorsAvailable
                )
                1 -> SessionSettingsPage(
                    onLeave = {
                        viewModel.disconnect()
                        onDisconnected()
                    }
                )
            }
        }
    }
}

@Composable
private fun LivePage(
    heartRate: Int,
    steps: Int,
    sendCount: Int,
    connectionState: ConnectionState,
    sensorsAvailable: Boolean
) {
    val listState = rememberScalingLazyListState()

    ScalingLazyColumn(
        modifier = Modifier.fillMaxSize(),
        state = listState,
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        // Connection indicator
        item {
            val statusColor = when (connectionState) {
                ConnectionState.CONNECTED -> Color(0xFF86EFAC)
                ConnectionState.CONNECTING, ConnectionState.RECONNECTING -> Color(0xFFFBBF24)
                ConnectionState.DISCONNECTED -> Color(0xFFF87171)
            }
            val statusText = when (connectionState) {
                ConnectionState.CONNECTED -> "LIVE"
                ConnectionState.CONNECTING -> "CONNECTING"
                ConnectionState.RECONNECTING -> "RECONNECTING"
                ConnectionState.DISCONNECTED -> "DISCONNECTED"
            }
            Text(
                text = statusText,
                color = statusColor,
                style = MaterialTheme.typography.caption3,
                fontWeight = FontWeight.Bold
            )
        }

        // Heart Rate — large center display
        item {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Text(
                    text = "$heartRate",
                    color = Color(0xFFF87171),
                    fontSize = 48.sp,
                    fontWeight = FontWeight.Bold,
                    fontFamily = FontFamily.Monospace,
                    textAlign = TextAlign.Center
                )
                Text(
                    text = "BPM",
                    color = Color(0xFFF87171).copy(alpha = 0.7f),
                    style = MaterialTheme.typography.caption3
                )
            }
        }

        // Steps and send count
        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceEvenly
            ) {
                StatItem(
                    value = "$steps",
                    label = "STEPS",
                    color = Color(0xFF34D399)
                )
                StatItem(
                    value = "$sendCount",
                    label = "SENT",
                    color = Color(0xFFA78BFA)
                )
            }
        }

        // Sensor status
        if (!sensorsAvailable) {
            item {
                Text(
                    text = "Simulated sensors",
                    color = Color(0xFFFBBF24),
                    style = MaterialTheme.typography.caption3,
                    textAlign = TextAlign.Center
                )
            }
        }
    }
}

@Composable
private fun SessionSettingsPage(
    onLeave: () -> Unit
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

        // Leave button at the top of settings
        item {
            Button(
                onClick = onLeave,
                modifier = Modifier
                    .fillMaxWidth(0.7f)
                    .padding(vertical = 4.dp),
                colors = ButtonDefaults.buttonColors(
                    backgroundColor = Color(0xFFEF4444)
                )
            ) {
                Text(
                    text = "LEAVE",
                    color = Color.White
                )
            }
        }
    }
}

@Composable
private fun StatItem(
    value: String,
    label: String,
    color: Color
) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(
            text = value,
            color = color,
            fontSize = 22.sp,
            fontWeight = FontWeight.Bold,
            fontFamily = FontFamily.Monospace
        )
        Text(
            text = label,
            color = color.copy(alpha = 0.7f),
            style = MaterialTheme.typography.caption3
        )
    }
}
