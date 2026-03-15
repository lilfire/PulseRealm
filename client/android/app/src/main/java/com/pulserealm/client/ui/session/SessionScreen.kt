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
import com.pulserealm.client.data.network.ClientSummaryData
import com.pulserealm.client.data.network.ConnectionState
import com.pulserealm.client.data.network.RealmSummaryData

@OptIn(androidx.compose.foundation.ExperimentalFoundationApi::class)
@Composable
fun RealmScreen(
    onDisconnected: () -> Unit,
    viewModel: RealmViewModel = hiltViewModel()
) {
    val heartRate by viewModel.heartRate.collectAsState()
    val steps by viewModel.steps.collectAsState()
    val sendCount by viewModel.sendCount.collectAsState()
    val connectionState by viewModel.connectionState.collectAsState()
    val sensorsAvailable by viewModel.sensorsAvailable.collectAsState()
    val realmEnded by viewModel.realmEnded.collectAsState()
    val eliminated by viewModel.eliminated.collectAsState()

    // Start streaming when screen appears
    DisposableEffect(Unit) {
        viewModel.startStreaming()
        onDispose {
            // Streaming continues in the foreground service
        }
    }

    // Show summary when realm ends
    val summary = realmEnded
    if (summary != null) {
        RealmEndedPager(
            summary = summary,
            clientId = viewModel.clientId,
            onDismiss = {
                viewModel.disconnect()
                onDisconnected()
            }
        )
        return
    }

    // Show eliminated screen when eliminated
    if (eliminated) {
        EliminatedScreen(
            onLeave = {
                viewModel.disconnect()
                onDisconnected()
            }
        )
        return
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
                1 -> RealmSettingsPage(
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

@OptIn(androidx.compose.foundation.ExperimentalFoundationApi::class)
@Composable
private fun RealmEndedPager(
    summary: RealmSummaryData,
    clientId: String,
    onDismiss: () -> Unit
) {
    // Find personal stats: match by clientId, or fall back to top-level
    val personal: ClientSummaryData? = summary.clientSummaries
        .firstOrNull { it.clientId == clientId }

    // Filter team members to only those on the same team as this client
    val myTeamName = personal?.teamName
    val teamMembers = if (myTeamName != null) {
        summary.clientSummaries.filter { it.teamName == myTeamName }
    } else {
        summary.clientSummaries
    }

    val pageCount = if (summary.isTeamFormat) 3 else 2
    val pagerState = rememberPagerState(initialPage = 0, pageCount = { pageCount })

    Scaffold(
        timeText = { TimeText() },
        vignette = { Vignette(vignettePosition = VignettePosition.TopAndBottom) }
    ) {
        HorizontalPager(
            state = pagerState,
            modifier = Modifier.fillMaxSize()
        ) { page ->
            when {
                page == 0 -> PersonalSummaryPage(summary, personal, onDismiss)
                page == 1 && summary.isTeamFormat -> TeamSummaryPage(myTeamName, teamMembers)
                else -> RealmSummaryPage(summary)
            }
        }
    }
}

@Composable
private fun PersonalSummaryPage(
    summary: RealmSummaryData,
    personal: ClientSummaryData?,
    onDismiss: () -> Unit
) {
    val listState = rememberScalingLazyListState()

    // Use personal stats if available, otherwise fall back to top-level
    val distance = personal?.distanceMeters ?: summary.totalDistanceMeters
    val steps = personal?.steps ?: summary.totalSteps
    val avgHr = personal?.averageHeartRate ?: summary.averageHeartRate
    val peakHr = personal?.maxHeartRate ?: summary.maxHeartRate
    val avgCadence = personal?.avgCadenceSpm ?: summary.avgCadenceSpm
    val timeInZone = personal?.timeInZone ?: summary.timeInZone

    ScalingLazyColumn(
        modifier = Modifier.fillMaxSize(),
        state = listState,
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        item {
            Text(
                text = "PERSONAL",
                color = Color(0xFF38BDF8),
                style = MaterialTheme.typography.title3,
                fontWeight = FontWeight.Bold,
                textAlign = TextAlign.Center
            )
        }

        // Distance
        item {
            val distanceText = if (distance >= 1000) {
                "%.2f km".format(distance / 1000)
            } else {
                "${distance.toInt()} m"
            }
            StatItem(value = distanceText, label = "DISTANCE", color = Color(0xFF34D399))
        }

        // Steps
        item {
            StatItem(value = "$steps", label = "STEPS", color = Color(0xFF34D399))
        }

        // Heart rate
        if (avgHr > 0) {
            item {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceEvenly
                ) {
                    StatItem(value = "$avgHr", label = "AVG HR", color = Color(0xFFF87171))
                    StatItem(value = "$peakHr", label = "PEAK HR", color = Color(0xFFF87171))
                }
            }
        }

        // Cadence
        if (avgCadence > 0) {
            item {
                StatItem(value = "$avgCadence", label = "AVG CADENCE", color = Color(0xFFA78BFA))
            }
        }

        // Zone breakdown
        val zoneColors = listOf(
            Color(0xFF2DD4BF), Color(0xFF22C55E), Color(0xFFF59E0B),
            Color(0xFFF87171), Color(0xFFEF4444)
        )
        for (z in 1..5) {
            val secs = timeInZone[z.toString()] ?: 0
            if (secs > 0) {
                item {
                    val m = secs / 60
                    val s = secs % 60
                    val timeText = if (m > 0) "${m}m ${s.toString().padStart(2, '0')}s" else "${s}s"
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text(
                            text = "Zone $z",
                            color = zoneColors[z - 1],
                            fontSize = 14.sp,
                            fontWeight = FontWeight.SemiBold
                        )
                        Text(
                            text = timeText,
                            color = Color.White,
                            fontSize = 14.sp,
                            fontFamily = FontFamily.Monospace
                        )
                    }
                }
            }
        }

        // Dismiss button
        item {
            Button(
                onClick = onDismiss,
                modifier = Modifier
                    .fillMaxWidth(0.7f)
                    .padding(vertical = 4.dp),
                colors = ButtonDefaults.buttonColors(
                    backgroundColor = Color(0xFF38BDF8)
                )
            ) {
                Text(text = "OK", color = Color.White)
            }
        }
    }
}

@Composable
private fun TeamSummaryPage(teamName: String?, teamMembers: List<ClientSummaryData>) {
    val listState = rememberScalingLazyListState()

    // Compute team-specific stats from members
    val teamDistance = teamMembers.sumOf { it.distanceMeters }
    val teamSteps = teamMembers.sumOf { it.steps }
    val teamAvgHr = if (teamMembers.isNotEmpty()) {
        teamMembers.filter { it.averageHeartRate > 0 }.let { active ->
            if (active.isNotEmpty()) active.sumOf { it.averageHeartRate } / active.size else 0
        }
    } else 0
    val teamMaxHr = if (teamMembers.isNotEmpty()) teamMembers.maxOf { it.maxHeartRate } else 0

    ScalingLazyColumn(
        modifier = Modifier.fillMaxSize(),
        state = listState,
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        item {
            Text(
                text = teamName?.uppercase() ?: "TEAM",
                color = Color(0xFFFBBF24),
                style = MaterialTheme.typography.title3,
                fontWeight = FontWeight.Bold,
                textAlign = TextAlign.Center
            )
        }

        // Team distance
        item {
            val distanceText = if (teamDistance >= 1000) {
                "%.2f km".format(teamDistance / 1000)
            } else {
                "${teamDistance.toInt()} m"
            }
            StatItem(value = distanceText, label = "DISTANCE", color = Color(0xFF34D399))
        }

        // Team steps
        item {
            StatItem(value = "$teamSteps", label = "STEPS", color = Color(0xFF34D399))
        }

        // Team HR
        if (teamAvgHr > 0) {
            item {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceEvenly
                ) {
                    StatItem(value = "$teamAvgHr", label = "AVG HR", color = Color(0xFFF87171))
                    StatItem(value = "$teamMaxHr", label = "PEAK HR", color = Color(0xFFF87171))
                }
            }
        }
    }
}

@Composable
private fun RealmSummaryPage(summary: RealmSummaryData) {
    val listState = rememberScalingLazyListState()

    ScalingLazyColumn(
        modifier = Modifier.fillMaxSize(),
        state = listState,
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        item {
            Text(
                text = "REALM",
                color = Color(0xFF38BDF8),
                style = MaterialTheme.typography.title3,
                fontWeight = FontWeight.Bold,
                textAlign = TextAlign.Center
            )
        }

        // Duration
        item {
            val minutes = (summary.durationSeconds / 60).toInt()
            val seconds = (summary.durationSeconds % 60).toInt()
            val durationText = if (minutes > 0) "${minutes}m ${seconds}s" else "${seconds}s"
            StatItem(value = durationText, label = "DURATION", color = Color(0xFF38BDF8))
        }

        // Active period
        item {
            val minutes = (summary.activePeriodSeconds / 60).toInt()
            val seconds = (summary.activePeriodSeconds % 60).toInt()
            val activeText = if (minutes > 0) "${minutes}m ${seconds}s" else "${seconds}s"
            StatItem(value = activeText, label = "ACTIVE TIME", color = Color(0xFF34D399))
        }

        // Participants
        item {
            StatItem(value = "${summary.participantCount}", label = "PARTICIPANTS", color = Color(0xFFA78BFA))
        }
    }
}

@Composable
private fun RealmSettingsPage(
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
private fun EliminatedScreen(
    onLeave: () -> Unit
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
            item {
                Text(
                    text = "ELIMINATED",
                    color = Color(0xFFEF4444),
                    fontSize = 24.sp,
                    fontWeight = FontWeight.Bold,
                    textAlign = TextAlign.Center
                )
            }

            item {
                Text(
                    text = "You've been knocked out!",
                    color = Color.White.copy(alpha = 0.7f),
                    style = MaterialTheme.typography.body1,
                    textAlign = TextAlign.Center
                )
            }

            item {
                Text(
                    text = "Waiting for results...",
                    color = Color.White.copy(alpha = 0.4f),
                    style = MaterialTheme.typography.caption3,
                    textAlign = TextAlign.Center
                )
            }

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
                    Text(text = "LEAVE", color = Color.White)
                }
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
