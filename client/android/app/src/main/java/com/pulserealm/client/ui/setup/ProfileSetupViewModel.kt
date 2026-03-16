package com.pulserealm.client.ui.setup

import android.content.SharedPreferences
import androidx.lifecycle.ViewModel
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import javax.inject.Inject

data class ProfileSetupUiState(
    val playerName: String = "",
    val heightCm: String = "",
    val weightKg: String = "",
) {
    val isComplete: Boolean
        get() = playerName.isNotBlank() && heightCm.isNotBlank() && weightKg.isNotBlank()
}

@HiltViewModel
class ProfileSetupViewModel @Inject constructor(
    private val prefs: SharedPreferences
) : ViewModel() {

    companion object {
        private const val PREF_PLAYER_NAME = "player_name"
        private const val PREF_HEIGHT_CM = "height_cm"
        private const val PREF_WEIGHT_KG = "weight_kg"
    }

    private val _uiState = MutableStateFlow(ProfileSetupUiState())
    val uiState: StateFlow<ProfileSetupUiState> = _uiState.asStateFlow()

    init {
        _uiState.value = ProfileSetupUiState(
            playerName = prefs.getString(PREF_PLAYER_NAME, "") ?: "",
            heightCm = prefs.getString(PREF_HEIGHT_CM, "") ?: "",
            weightKg = prefs.getString(PREF_WEIGHT_KG, "") ?: "",
        )
    }

    fun updatePlayerName(name: String) {
        _uiState.value = _uiState.value.copy(playerName = name)
        prefs.edit().putString(PREF_PLAYER_NAME, name).apply()
    }

    fun updateHeightCm(height: String) {
        val filtered = height.filter { it.isDigit() || it == '.' }
        _uiState.value = _uiState.value.copy(heightCm = filtered)
        prefs.edit().putString(PREF_HEIGHT_CM, filtered).apply()
    }

    fun updateWeightKg(weight: String) {
        val filtered = weight.filter { it.isDigit() || it == '.' }
        _uiState.value = _uiState.value.copy(weightKg = filtered)
        prefs.edit().putString(PREF_WEIGHT_KG, filtered).apply()
    }
}
