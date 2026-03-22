package com.pulserealm.client.ui.components

import android.app.RemoteInput
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.material.Button
import androidx.wear.compose.material.ButtonColors
import androidx.wear.compose.material.ButtonDefaults
import androidx.wear.compose.material.MaterialTheme
import androidx.wear.compose.material.Text
import kotlinx.coroutines.delay
import androidx.wear.input.RemoteInputIntentHelper
import com.pulserealm.client.ui.theme.PulseColors

@Composable
fun WearTextInputButton(
    label: String,
    value: String,
    placeholder: String,
    modifier: Modifier = Modifier.fillMaxWidth(0.9f),
    onClick: () -> Unit
) {
    Column(
        modifier = modifier,
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        Text(
            text = label,
            color = PulseColors.MutedText,
            style = MaterialTheme.typography.caption3,
            textAlign = TextAlign.Center
        )
        Button(
            onClick = onClick,
            modifier = Modifier
                .fillMaxWidth()
                .height(36.dp),
            colors = ButtonDefaults.buttonColors(
                backgroundColor = PulseColors.DarkSurface
            )
        ) {
            Text(
                text = value.ifEmpty { placeholder },
                color = if (value.isEmpty()) PulseColors.DarkestText else Color.White,
                fontSize = 13.sp,
                fontFamily = FontFamily.Monospace,
                textAlign = TextAlign.Center,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }
    }
}

@Composable
fun ProfileField(
    label: String,
    inputKey: String,
    value: String,
    onValueChange: (String) -> Unit
) {
    val launcher = rememberLauncherForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        val data = result.data ?: return@rememberLauncherForActivityResult
        val results = RemoteInput.getResultsFromIntent(data)
        val newValue = results.getCharSequence(inputKey)?.toString() ?: return@rememberLauncherForActivityResult
        onValueChange(newValue)
    }

    WearTextInputButton(
        label = label,
        value = value,
        placeholder = "---",
        modifier = Modifier.fillMaxWidth(0.85f),
        onClick = {
            val intent = RemoteInputIntentHelper.createActionRemoteInputIntent()
            val remoteInput = RemoteInput.Builder(inputKey)
                .setLabel(label)
                .build()
            RemoteInputIntentHelper.putRemoteInputsExtra(intent, listOf(remoteInput))
            launcher.launch(intent)
        }
    )
}

@Composable
fun RepeatingButton(
    onClick: (holdTicks: Int) -> Unit,
    modifier: Modifier = Modifier,
    colors: ButtonColors = ButtonDefaults.buttonColors(),
    content: @Composable () -> Unit
) {
    var pressed by remember { mutableStateOf(false) }

    Button(
        onClick = { onClick(0) },
        modifier = modifier.pointerInput(Unit) {
            detectTapGestures(
                onPress = {
                    pressed = true
                    tryAwaitRelease()
                    pressed = false
                }
            )
        },
        colors = colors,
        content = { content() }
    )

    LaunchedEffect(pressed) {
        if (!pressed) return@LaunchedEffect
        delay(400)
        var ticks = 0
        while (pressed) {
            onClick(ticks)
            delay(150)
            ticks++
        }
    }
}

@Composable
fun NumericStepperField(
    label: String,
    value: String,
    onValueChange: (String) -> Unit,
    minValue: Int,
    maxValue: Int,
    step: Int = 1,
    largeStep: Int = 0,
    defaultValue: Int = minValue,
    unit: String = "",
    subtitle: String? = null,
    modifier: Modifier = Modifier.fillMaxWidth(0.85f)
) {
    val currentValue = value.toIntOrNull() ?: defaultValue
    val hasLargeStep = largeStep > 0

    fun stepMultiplier(holdTicks: Int): Int = if (hasLargeStep) 1 else when {
        holdTicks > 20 -> 10
        holdTicks > 10 -> 5
        else -> 1
    }

    @Composable
    fun StepButton(text: String, stepAmount: Int, size: Dp = 32.dp) {
        RepeatingButton(
            onClick = { holdTicks ->
                val effectiveStep = stepAmount * (if (hasLargeStep) 1 else stepMultiplier(holdTicks))
                val newValue = (currentValue + effectiveStep).coerceIn(minValue, maxValue)
                onValueChange(newValue.toString())
            },
            modifier = Modifier.size(size),
            colors = ButtonDefaults.buttonColors(
                backgroundColor = PulseColors.DarkSurface
            )
        ) {
            Text(
                text = text,
                color = PulseColors.Cyan,
                fontSize = if (hasLargeStep) 12.sp else 16.sp,
                textAlign = TextAlign.Center
            )
        }
    }

    Column(
        modifier = modifier,
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        Text(
            text = label,
            color = PulseColors.MutedText,
            style = MaterialTheme.typography.caption3,
            textAlign = TextAlign.Center
        )
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.Center,
            verticalAlignment = Alignment.CenterVertically
        ) {
            if (hasLargeStep) {
                StepButton(text = "−$largeStep", stepAmount = -largeStep, size = 36.dp)
                Spacer(modifier = Modifier.width(2.dp))
            }
            StepButton(text = "−", stepAmount = -step)
            Text(
                text = if (value.isNotEmpty()) "$currentValue$unit" else "---",
                color = if (value.isEmpty()) PulseColors.DarkestText else Color.White,
                fontSize = 14.sp,
                fontFamily = FontFamily.Monospace,
                textAlign = TextAlign.Center,
                modifier = Modifier.weight(1f)
            )
            StepButton(text = "+", stepAmount = step)
            if (hasLargeStep) {
                Spacer(modifier = Modifier.width(2.dp))
                StepButton(text = "+$largeStep", stepAmount = largeStep, size = 36.dp)
            }
        }
        if (subtitle != null) {
            Text(
                text = subtitle,
                color = PulseColors.DimText,
                fontSize = 10.sp,
                textAlign = TextAlign.Center
            )
        }
    }
}
