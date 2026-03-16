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
import com.pulserealm.client.ui.components.ProfileField
import com.pulserealm.client.ui.theme.PulseColors
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
                    viewModel = viewModel,
                    onChangeServer = onChangeServer
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
            ProfileField(
                label = "Height (cm)",
                inputKey = "height_cm",
                value = uiState.heightCm,
                onValueChange = { viewModel.updateHeightCm(it) }
            )
        }
        item {
            ProfileField(
                label = "Weight (kg)",
                inputKey = "weight_kg",
                value = uiState.weightKg,
                onValueChange = { viewModel.updateWeightKg(it) }
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
