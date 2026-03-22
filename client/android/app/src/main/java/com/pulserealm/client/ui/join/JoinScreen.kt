@file:OptIn(ExperimentalFoundationApi::class)

package com.pulserealm.client.ui.join

import androidx.compose.foundation.ExperimentalFoundationApi
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
import com.pulserealm.client.data.network.ConnectionState
import com.pulserealm.client.data.network.StrideCalibrationPoint
import com.pulserealm.client.ui.components.NumericStepperField
import com.pulserealm.client.ui.components.ProfileField
import com.pulserealm.client.ui.theme.PulseColors
import kotlin.math.abs
import kotlin.math.roundToInt
import kotlinx.coroutines.delay

@Composable
fun JoinScreen(
    onJoined: (realmId: String, clientId: String, serverUrl: String) -> Unit,
    onChangeServer: () -> Unit,
    viewModel: JoinViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    val connectionState by viewModel.connectionState.collectAsState()

    // Navigate when joined
    LaunchedEffect(uiState.isJoined, uiState.realmInfo) {
        if (uiState.isJoined && uiState.realmInfo != null) {
            onJoined(
                uiState.realmInfo!!.id,
                uiState.clientId,
                uiState.serverUrl
            )
        }
    }

    val pagerState = rememberPagerState(initialPage = 0, pageCount = { 3 })

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
                    viewModel = viewModel,
                    onChangeServer = onChangeServer
                )
                2 -> StrideProfilePage(uiState = uiState)
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
        val codeHeight = availableHeight * 0.14f
        val padHeight = availableHeight * 0.62f
        val padSpacing = 2.dp
        val buttonSize = minOf(
            (padHeight - padSpacing * 3) / 4,
            (availableWidth - padSpacing * 2) / 3,
            36.dp
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
                        indicatorColor = PulseColors.Cyan
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

@Composable
private fun SettingsPage(
    uiState: JoinUiState,
    viewModel: JoinViewModel,
    onChangeServer: () -> Unit
) {
    val listState = rememberScalingLazyListState()

    Box(modifier = Modifier.fillMaxSize()) {
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

        // Profile fields
        item {
            ProfileField(
                label = "Name",
                inputKey = "player_name",
                value = uiState.playerName,
                onValueChange = { viewModel.updatePlayerName(it) }
            )
        }
        item {
            NumericStepperField(
                label = "Age",
                value = uiState.age,
                onValueChange = { viewModel.updateAge(it) },
                minValue = 5,
                maxValue = 120,
                defaultValue = 25,
                unit = " yrs"
            )
        }
        item {
            NumericStepperField(
                label = "Height (cm)",
                value = uiState.heightCm,
                onValueChange = { viewModel.updateHeightCm(it) },
                minValue = 100,
                maxValue = 220,
                defaultValue = 170,
                unit = " cm"
            )
        }
        item {
            NumericStepperField(
                label = "Weight (kg)",
                value = uiState.weightKg,
                onValueChange = { viewModel.updateWeightKg(it) },
                minValue = 30,
                maxValue = 200,
                defaultValue = 70,
                unit = " kg"
            )
        }

        // HR Zones section
        val maxHr = uiState.maxHrOverride.toIntOrNull()
            ?: uiState.age.toIntOrNull()?.let { 220 - it }

        item {
            Text(
                text = "HR Zones",
                style = MaterialTheme.typography.title3,
                color = PulseColors.Cyan,
                textAlign = TextAlign.Center
            )
        }
        item {
            val pct = uiState.zone12.toIntOrNull() ?: 57
            NumericStepperField(
                label = "Zone 1→2",
                value = uiState.zone12,
                onValueChange = { viewModel.updateZone12(it) },
                minValue = 20,
                maxValue = 95,
                defaultValue = 57,
                unit = "%",
                subtitle = maxHr?.let { "${pct}% · ${it * pct / 100} bpm" }
            )
        }
        item {
            val pct = uiState.zone23.toIntOrNull() ?: 63
            NumericStepperField(
                label = "Zone 2→3",
                value = uiState.zone23,
                onValueChange = { viewModel.updateZone23(it) },
                minValue = 20,
                maxValue = 95,
                defaultValue = 63,
                unit = "%",
                subtitle = maxHr?.let { "${pct}% · ${it * pct / 100} bpm" }
            )
        }
        item {
            val pct = uiState.zone34.toIntOrNull() ?: 76
            NumericStepperField(
                label = "Zone 3→4",
                value = uiState.zone34,
                onValueChange = { viewModel.updateZone34(it) },
                minValue = 20,
                maxValue = 95,
                defaultValue = 76,
                unit = "%",
                subtitle = maxHr?.let { "${pct}% · ${it * pct / 100} bpm" }
            )
        }
        item {
            val pct = uiState.zone45.toIntOrNull() ?: 89
            NumericStepperField(
                label = "Zone 4→5",
                value = uiState.zone45,
                onValueChange = { viewModel.updateZone45(it) },
                minValue = 20,
                maxValue = 95,
                defaultValue = 89,
                unit = "%",
                subtitle = maxHr?.let { "${pct}% · ${it * pct / 100} bpm" }
            )
        }
        item {
            NumericStepperField(
                label = "Max HR",
                value = uiState.maxHrOverride,
                onValueChange = { viewModel.updateMaxHrOverride(it) },
                minValue = 100,
                maxValue = 250,
                defaultValue = 190,
                largeStep = 10,
                unit = " bpm"
            )
        }

        // Server info + change
        item {
            Text(
                text = uiState.serverUrl.removePrefix("http://"),
                color = PulseColors.DimText,
                fontSize = 10.sp,
                textAlign = TextAlign.Center,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }
        item {
            Button(
                onClick = onChangeServer,
                modifier = Modifier.fillMaxWidth(0.85f),
                colors = ButtonDefaults.buttonColors(
                    backgroundColor = PulseColors.DarkSurface
                )
            ) {
                Text(
                    text = "Change Server",
                    color = PulseColors.MutedText,
                    fontSize = 11.sp,
                    textAlign = TextAlign.Center
                )
            }
        }

        // Version
        item {
            Text(
                text = "v${com.pulserealm.client.BuildConfig.VERSION_NAME}",
                color = PulseColors.DarkestText,
                style = MaterialTheme.typography.caption3,
                textAlign = TextAlign.Center
            )
        }
    }

    // Recalculate Max HR dialog
    if (uiState.showRecalculateMaxHr) {
        val newMaxHr = uiState.age.toIntOrNull()?.let { 220 - it } ?: 190
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(Color.Black.copy(alpha = 0.85f)),
            contentAlignment = Alignment.Center
        ) {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier.padding(horizontal = 20.dp)
            ) {
                Text(
                    text = "Recalculate Max HR?",
                    color = Color.White,
                    fontSize = 14.sp,
                    textAlign = TextAlign.Center
                )
                Text(
                    text = "Set to $newMaxHr bpm",
                    color = PulseColors.DimText,
                    fontSize = 12.sp,
                    textAlign = TextAlign.Center
                )
                Row(
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Button(
                        onClick = { viewModel.dismissRecalculateMaxHr() },
                        colors = ButtonDefaults.buttonColors(
                            backgroundColor = PulseColors.DarkSurface
                        ),
                        modifier = Modifier.size(48.dp)
                    ) {
                        Text("✕", color = Color.White, fontSize = 16.sp)
                    }
                    Button(
                        onClick = { viewModel.confirmRecalculateMaxHr() },
                        colors = ButtonDefaults.buttonColors(
                            backgroundColor = PulseColors.Cyan
                        ),
                        modifier = Modifier.size(48.dp)
                    ) {
                        Text("✓", color = Color.Black, fontSize = 16.sp)
                    }
                }
            }
        }
    }
    } // Box
}

/** Default speed-stride curve (biomechanical research), matching server/frontend. */
private val DEFAULT_STRIDE_CURVE: List<Pair<Double, Double>> = listOf(
    0.0 to 0.35,
    3.0 to 0.35,
    5.0 to 0.415,
    8.0 to 0.55,
    12.0 to 0.65,
    15.0 to 0.75,
)

private const val DEFAULT_WALKING_FACTOR = 0.415

/** Piecewise linear interpolation over sorted (speed, factor) data points. */
private fun interpolateStrideFactor(
    points: List<Pair<Double, Double>>,
    speedKmh: Double
): Double {
    if (points.isEmpty()) return DEFAULT_WALKING_FACTOR
    if (points.size == 1) return points[0].second

    if (speedKmh <= points.first().first) return points.first().second
    if (speedKmh >= points.last().first) return points.last().second

    for (i in 0 until points.size - 1) {
        val (x0, y0) = points[i]
        val (x1, y1) = points[i + 1]
        if (speedKmh in x0..x1) {
            if (abs(x1 - x0) < 0.001) return y0
            val t = (speedKmh - x0) / (x1 - x0)
            return y0 + t * (y1 - y0)
        }
    }
    return points.last().second
}

/** Returns the effective stride factor for a given speed, considering calibration and legacy factor. */
private fun getEffectiveStrideFactor(
    speedKmh: Double,
    calibration: List<StrideCalibrationPoint>?,
    strideFactor: Double
): Double {
    if (calibration != null && calibration.size >= 2) {
        val sorted = calibration.sortedBy { it.speedKmh }.map { it.speedKmh to it.strideFactor }
        return interpolateStrideFactor(sorted, speedKmh)
    }
    val baseFactor = interpolateStrideFactor(DEFAULT_STRIDE_CURVE, speedKmh)
    if (strideFactor > 0 && abs(strideFactor - DEFAULT_WALKING_FACTOR) > 0.001) {
        return baseFactor * (strideFactor / DEFAULT_WALKING_FACTOR)
    }
    return baseFactor
}

private fun getDefaultStrideFactor(speedKmh: Double): Double {
    return interpolateStrideFactor(DEFAULT_STRIDE_CURVE, speedKmh)
}

@Composable
private fun StrideProfilePage(uiState: JoinUiState) {
    val listState = rememberScalingLazyListState()
    val heightCm = uiState.heightCm.toDoubleOrNull() ?: 170.0
    val hasCalibration = (uiState.strideCalibration?.size ?: 0) >= 2
    val hasCustomFactor = uiState.strideFactor > 0 &&
        abs(uiState.strideFactor - DEFAULT_WALKING_FACTOR) > 0.001
    val isCalibrated = hasCalibration || hasCustomFactor
    val speedTiers = listOf(3.0, 5.0, 8.0, 12.0, 15.0)
    val speedLabels = listOf("Walk", "Brisk", "Jog", "Run", "Sprint")

    ScalingLazyColumn(
        modifier = Modifier.fillMaxSize(),
        state = listState,
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(6.dp)
    ) {
        item {
            Text(
                text = "Stride Profile",
                style = MaterialTheme.typography.title3,
                color = PulseColors.Cyan,
                textAlign = TextAlign.Center
            )
        }

        item {
            Text(
                text = if (isCalibrated) "Calibrated" else "Using Defaults",
                color = if (isCalibrated) PulseColors.Green else PulseColors.MutedText,
                style = MaterialTheme.typography.caption3,
                textAlign = TextAlign.Center
            )
        }

        item {
            Text(
                text = "Height: ${heightCm.roundToInt()} cm",
                color = PulseColors.MutedText,
                fontSize = 11.sp,
                textAlign = TextAlign.Center
            )
        }

        // Column headers
        item {
            Row(
                modifier = Modifier.fillMaxWidth(0.9f),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text(
                    text = "Speed",
                    color = PulseColors.DimText,
                    fontSize = 10.sp,
                    modifier = Modifier.weight(1f),
                    textAlign = TextAlign.Start
                )
                Text(
                    text = "Stride",
                    color = PulseColors.DimText,
                    fontSize = 10.sp,
                    modifier = Modifier.weight(1f),
                    textAlign = TextAlign.Center
                )
                if (isCalibrated) {
                    Text(
                        text = "Diff",
                        color = PulseColors.DimText,
                        fontSize = 10.sp,
                        modifier = Modifier.weight(0.6f),
                        textAlign = TextAlign.End
                    )
                }
            }
        }

        // Stride rows
        for (i in speedTiers.indices) {
            item {
                val speed = speedTiers[i]
                val factor = getEffectiveStrideFactor(
                    speed, uiState.strideCalibration, uiState.strideFactor
                )
                val strideCm = heightCm * factor
                val defaultFactor = getDefaultStrideFactor(speed)
                val defaultStrideCm = heightCm * defaultFactor
                val diffCm = strideCm - defaultStrideCm

                Row(
                    modifier = Modifier.fillMaxWidth(0.9f),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = "${speed.roundToInt()} km/h",
                            color = Color.White,
                            fontSize = 12.sp
                        )
                        Text(
                            text = speedLabels[i],
                            color = PulseColors.DimText,
                            fontSize = 9.sp
                        )
                    }
                    Text(
                        text = "${String.format("%.1f", strideCm)} cm",
                        color = Color.White,
                        fontSize = 12.sp,
                        fontFamily = FontFamily.Monospace,
                        modifier = Modifier.weight(1f),
                        textAlign = TextAlign.Center
                    )
                    if (isCalibrated) {
                        val sign = if (diffCm >= 0) "+" else ""
                        Text(
                            text = "$sign${String.format("%.1f", diffCm)}",
                            color = if (diffCm >= 0) PulseColors.Green else PulseColors.Red,
                            fontSize = 11.sp,
                            fontFamily = FontFamily.Monospace,
                            modifier = Modifier.weight(0.6f),
                            textAlign = TextAlign.End
                        )
                    }
                }
            }
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
                                "\u232B" -> PulseColors.DarkestText
                                "\u2713" -> if (canJoin) PulseColors.Cyan else PulseColors.DarkestText
                                else -> PulseColors.DarkSurface
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
