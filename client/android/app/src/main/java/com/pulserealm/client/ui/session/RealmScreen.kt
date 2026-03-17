@file:OptIn(ExperimentalFoundationApi::class)

package com.pulserealm.client.ui.session

import androidx.compose.foundation.ExperimentalFoundationApi
import android.app.Activity
import android.view.WindowManager
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
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
import com.pulserealm.client.ui.theme.PulseColors
import kotlinx.coroutines.delay

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
    val realmStarted by viewModel.realmStarted.collectAsState()

    // Keep screen on only while in the realm (active workout)
    val activity = LocalContext.current as? Activity
    DisposableEffect(Unit) {
        activity?.window?.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        viewModel.startStreaming()
        onDispose {
            activity?.window?.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        }
    }

    // Reset step counter when realm starts so pre-lobby steps don't carry over
    LaunchedEffect(realmStarted) {
        if (realmStarted) {
            viewModel.resetSteps()
        }
    }

    // Show summary when realm ends
    val summary = realmEnded
    if (summary != null) {
        RealmEndedPager(
            summary = summary,
            clientId = viewModel.clientId,
            heightCm = viewModel.heightCm,
            onCalibrate = viewModel::saveStrideFactor,
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
                if (!viewModel.leaveRealm()) {
                    onDisconnected()
                }
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
                        if (!viewModel.leaveRealm()) {
                            onDisconnected()
                        }
                        // If leaveRealm returned true, summary screen will appear via realmEnded state
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
                ConnectionState.CONNECTED -> PulseColors.LightGreen
                ConnectionState.CONNECTING, ConnectionState.RECONNECTING -> PulseColors.Yellow
                ConnectionState.DISCONNECTED -> PulseColors.Red
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
                    color = PulseColors.Red,
                    fontSize = 48.sp,
                    fontWeight = FontWeight.Bold,
                    fontFamily = FontFamily.Monospace,
                    textAlign = TextAlign.Center
                )
                Text(
                    text = "BPM",
                    color = PulseColors.Red.copy(alpha = 0.7f),
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
                    color = PulseColors.Green
                )
                StatItem(
                    value = "$sendCount",
                    label = "SENT",
                    color = PulseColors.Purple
                )
            }
        }

        // Sensor status
        if (!sensorsAvailable) {
            item {
                Text(
                    text = "Simulated sensors",
                    color = PulseColors.Yellow,
                    style = MaterialTheme.typography.caption3,
                    textAlign = TextAlign.Center
                )
            }
        }
    }
}

@Composable
private fun RealmEndedPager(
    summary: RealmSummaryData,
    clientId: String,
    heightCm: Double,
    onCalibrate: (Double) -> Unit,
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
                page == 0 -> PersonalSummaryPage(summary, personal, heightCm, onCalibrate, onDismiss)
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
    heightCm: Double,
    onCalibrate: (Double) -> Unit,
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

    // Calibration state
    var showCalibration by remember { mutableStateOf(false) }
    var distanceInput by remember { mutableStateOf("") }
    var calibrationError by remember { mutableStateOf<String?>(null) }
    var calibrationSaved by remember { mutableStateOf(false) }

    // Auto-hide "Saved!" after 2 seconds
    LaunchedEffect(calibrationSaved) {
        if (calibrationSaved) {
            delay(2000)
            calibrationSaved = false
        }
    }

    val canCalibrate = heightCm > 0 && steps > 0

    ScalingLazyColumn(
        modifier = Modifier.fillMaxSize(),
        state = listState,
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        item {
            Text(
                text = "PERSONAL",
                color = PulseColors.Cyan,
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
            StatItem(value = distanceText, label = "DISTANCE", color = PulseColors.Green)
        }

        // Steps
        item {
            StatItem(value = "$steps", label = "STEPS", color = PulseColors.Green)
        }

        // Heart rate
        if (avgHr > 0) {
            item {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceEvenly
                ) {
                    StatItem(value = "$avgHr", label = "AVG HR", color = PulseColors.Red)
                    StatItem(value = "$peakHr", label = "PEAK HR", color = PulseColors.Red)
                }
            }
        }

        // Cadence
        if (avgCadence > 0) {
            item {
                StatItem(value = "$avgCadence", label = "AVG CADENCE", color = PulseColors.Purple)
            }
        }

        // Zone breakdown
        val zoneColors = listOf(
            PulseColors.Teal, PulseColors.BrightGreen, PulseColors.Amber,
            PulseColors.Red, PulseColors.BrightRed
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

        // Calibration
        if (canCalibrate) {
            item {
                if (calibrationSaved) {
                    Text(
                        text = "Saved!",
                        color = PulseColors.Green,
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Bold,
                        textAlign = TextAlign.Center
                    )
                } else if (!showCalibration) {
                    Button(
                        onClick = {
                            showCalibration = true
                            calibrationError = null
                            distanceInput = ""
                        },
                        modifier = Modifier
                            .fillMaxWidth(0.7f)
                            .padding(vertical = 4.dp),
                        colors = ButtonDefaults.buttonColors(
                            backgroundColor = PulseColors.Purple
                        )
                    ) {
                        Text(text = "CALIBRATE", color = Color.White, fontSize = 12.sp)
                    }
                } else {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(4.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Text(
                            text = "Actual Distance (m)",
                            color = Color.White.copy(alpha = 0.7f),
                            fontSize = 12.sp,
                            textAlign = TextAlign.Center
                        )
                        BasicTextField(
                            value = distanceInput,
                            onValueChange = { distanceInput = it.filter { c -> c.isDigit() || c == '.' } },
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                            textStyle = TextStyle(
                                color = Color.White,
                                fontSize = 18.sp,
                                fontFamily = FontFamily.Monospace,
                                textAlign = TextAlign.Center
                            ),
                            cursorBrush = SolidColor(PulseColors.Cyan),
                            modifier = Modifier
                                .fillMaxWidth(0.6f)
                                .padding(vertical = 2.dp)
                        )
                        if (calibrationError != null) {
                            Text(
                                text = calibrationError!!,
                                color = PulseColors.BrightRed,
                                fontSize = 11.sp,
                                textAlign = TextAlign.Center
                            )
                        }
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            Button(
                                onClick = {
                                    val actualDist = distanceInput.toDoubleOrNull()
                                    if (actualDist == null || actualDist <= 0) {
                                        calibrationError = "Enter a valid distance"
                                        return@Button
                                    }
                                    val factor = actualDist * 100.0 / (steps * heightCm)
                                    if (factor < 0.2 || factor > 0.8) {
                                        calibrationError = "Factor ${"%.3f".format(factor)} out of range (0.2-0.8)"
                                        return@Button
                                    }
                                    onCalibrate(factor)
                                    showCalibration = false
                                    calibrationSaved = true
                                },
                                modifier = Modifier.size(width = 60.dp, height = 32.dp),
                                colors = ButtonDefaults.buttonColors(
                                    backgroundColor = PulseColors.Green
                                )
                            ) {
                                Text(text = "SAVE", color = Color.White, fontSize = 11.sp)
                            }
                            Button(
                                onClick = { showCalibration = false },
                                modifier = Modifier.size(width = 60.dp, height = 32.dp),
                                colors = ButtonDefaults.buttonColors(
                                    backgroundColor = Color.DarkGray
                                )
                            ) {
                                Text(text = "CANCEL", color = Color.White, fontSize = 11.sp)
                            }
                        }
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
                    backgroundColor = PulseColors.Cyan
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
                color = PulseColors.Yellow,
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
            StatItem(value = distanceText, label = "DISTANCE", color = PulseColors.Green)
        }

        // Team steps
        item {
            StatItem(value = "$teamSteps", label = "STEPS", color = PulseColors.Green)
        }

        // Team HR
        if (teamAvgHr > 0) {
            item {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceEvenly
                ) {
                    StatItem(value = "$teamAvgHr", label = "AVG HR", color = PulseColors.Red)
                    StatItem(value = "$teamMaxHr", label = "PEAK HR", color = PulseColors.Red)
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
                color = PulseColors.Cyan,
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
            StatItem(value = durationText, label = "DURATION", color = PulseColors.Cyan)
        }

        // Active period
        item {
            val minutes = (summary.activePeriodSeconds / 60).toInt()
            val seconds = (summary.activePeriodSeconds % 60).toInt()
            val activeText = if (minutes > 0) "${minutes}m ${seconds}s" else "${seconds}s"
            StatItem(value = activeText, label = "ACTIVE TIME", color = PulseColors.Green)
        }

        // Participants
        item {
            StatItem(value = "${summary.participantCount}", label = "PARTICIPANTS", color = PulseColors.Purple)
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
                color = PulseColors.Cyan,
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
                    backgroundColor = PulseColors.BrightRed
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
                    color = PulseColors.BrightRed,
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
                        backgroundColor = PulseColors.BrightRed
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
