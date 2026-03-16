package com.pulserealm.client.ui.setup

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
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
import com.pulserealm.client.ui.components.ProfileField
import com.pulserealm.client.ui.theme.PulseColors

@Composable
fun ProfileSetupScreen(
    onComplete: () -> Unit,
    viewModel: ProfileSetupViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    val listState = rememberScalingLazyListState()

    // Auto-skip if profile is already complete (returning user)
    LaunchedEffect(uiState.isComplete) {
        if (uiState.isComplete) {
            onComplete()
        }
    }

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
                    text = "Profile Setup",
                    style = MaterialTheme.typography.title3,
                    color = PulseColors.Cyan,
                    textAlign = TextAlign.Center
                )
            }

            item {
                Text(
                    text = "Fill in your profile to continue",
                    color = PulseColors.MutedText,
                    style = MaterialTheme.typography.caption3,
                    textAlign = TextAlign.Center
                )
            }

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

            item {
                Button(
                    onClick = onComplete,
                    modifier = Modifier.fillMaxWidth(0.7f),
                    colors = ButtonDefaults.buttonColors(
                        backgroundColor = if (uiState.isComplete) PulseColors.Cyan else PulseColors.DarkSurface
                    ),
                    enabled = uiState.isComplete
                ) {
                    Text(
                        text = "Continue",
                        color = if (uiState.isComplete) Color.Black else PulseColors.DimText,
                        fontSize = 12.sp
                    )
                }
            }
        }
    }
}
