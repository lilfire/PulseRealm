package com.pulserealm.client.ui.join

import android.content.SharedPreferences
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.pulserealm.client.data.network.ConnectionState
import com.pulserealm.client.data.network.SignalRClient
import com.pulserealm.client.data.network.StrideCalibrationPoint
import com.pulserealm.client.data.network.UserFriendlyErrors
import com.pulserealm.client.data.network.parseStrideCalibration
import com.pulserealm.client.data.model.RealmInfo
import com.pulserealm.client.data.network.RealmApi
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import javax.inject.Inject

data class JoinUiState(
    val serverUrl: String = "",
    val joinCode: String = "",
    val playerName: String = "",
    val age: String = "",
    val heightCm: String = "",
    val weightKg: String = "",
    val zone12: String = "57",
    val zone23: String = "63",
    val zone34: String = "76",
    val zone45: String = "89",
    val maxHrOverride: String = "",
    val isLoading: Boolean = false,
    val errorMessage: String? = null,
    val realmInfo: RealmInfo? = null,
    val isJoined: Boolean = false,
    val clientId: String = "",
)

@HiltViewModel
class JoinViewModel @Inject constructor(
    private val signalRClient: SignalRClient,
    private val prefs: SharedPreferences,
    savedStateHandle: SavedStateHandle
) : ViewModel() {

    companion object {
        private const val PREF_PLAYER_NAME = "player_name"
        private const val PREF_AGE = "age"
        private const val PREF_HEIGHT_CM = "height_cm"
        private const val PREF_WEIGHT_KG = "weight_kg"
        private const val PREF_CLIENT_ID = "client_id"
        private const val PREF_SERVER_URL = "cached_server_url"
        private const val PREF_STRIDE_FACTOR = "stride_factor"
        private const val PREF_ZONE_1_2 = "zone_1_2"
        private const val PREF_ZONE_2_3 = "zone_2_3"
        private const val PREF_ZONE_3_4 = "zone_3_4"
        private const val PREF_ZONE_4_5 = "zone_4_5"
        private const val PREF_MAX_HR = "max_hr"
    }

    private val _uiState = MutableStateFlow(JoinUiState())
    val uiState: StateFlow<JoinUiState> = _uiState.asStateFlow()

    val connectionState: StateFlow<ConnectionState> = signalRClient.connectionState

    private val strideFactor: Double = prefs.getFloat(PREF_STRIDE_FACTOR, 0f).toDouble()
    // Use shared parseStrideCalibration() to avoid duplicating JSON parsing logic
    private val strideCalibration: List<StrideCalibrationPoint>? =
        parseStrideCalibration(prefs.getString("stride_calibration", null))
    private val zone12: Int get() = prefs.getInt(PREF_ZONE_1_2, 57)
    private val zone23: Int get() = prefs.getInt(PREF_ZONE_2_3, 63)
    private val zone34: Int get() = prefs.getInt(PREF_ZONE_3_4, 76)
    private val zone45: Int get() = prefs.getInt(PREF_ZONE_4_5, 89)
    private val maxHrOverride: Int get() = prefs.getInt(PREF_MAX_HR, 0)

    // Cached Retrofit instance, rebuilt only when base URL changes
    private var cachedRetrofit: Retrofit? = null
    private var cachedRetrofitBaseUrl: String? = null

    // Overridable for testing
    internal var realmApiFactory: (String) -> RealmApi = ::getRealmApi

    init {
        // Load or generate a stable client ID
        val clientId = prefs.getString(PREF_CLIENT_ID, null) ?: run {
            val id = "wear-" + java.util.UUID.randomUUID().toString().take(8)
            prefs.edit().putString(PREF_CLIENT_ID, id).apply()
            id
        }

        // Server URL from navigation argument
        val serverUrl = java.net.URLDecoder.decode(
            savedStateHandle.get<String>("serverUrl") ?: "", "UTF-8"
        )

        // Load saved profile settings
        val savedName = prefs.getString(PREF_PLAYER_NAME, "") ?: ""
        val savedAge = prefs.getString(PREF_AGE, "") ?: ""
        val savedHeight = prefs.getString(PREF_HEIGHT_CM, "") ?: ""
        val savedWeight = prefs.getString(PREF_WEIGHT_KG, "") ?: ""

        val savedZone12 = prefs.getInt(PREF_ZONE_1_2, 57).toString()
        val savedZone23 = prefs.getInt(PREF_ZONE_2_3, 63).toString()
        val savedZone34 = prefs.getInt(PREF_ZONE_3_4, 76).toString()
        val savedZone45 = prefs.getInt(PREF_ZONE_4_5, 89).toString()
        val savedMaxHr = prefs.getInt(PREF_MAX_HR, 0).let { if (it > 0) it.toString() else "" }

        _uiState.value = JoinUiState(
            clientId = clientId,
            serverUrl = serverUrl,
            playerName = savedName,
            age = savedAge,
            heightCm = savedHeight,
            weightKg = savedWeight,
            zone12 = savedZone12,
            zone23 = savedZone23,
            zone34 = savedZone34,
            zone45 = savedZone45,
            maxHrOverride = savedMaxHr,
        )
    }

    fun updateJoinCode(code: String) {
        _uiState.value = _uiState.value.copy(
            joinCode = code.filter { it.isDigit() }.take(6),
            errorMessage = null
        )
    }

    fun updatePlayerName(name: String) {
        _uiState.value = _uiState.value.copy(playerName = name)
        prefs.edit().putString(PREF_PLAYER_NAME, name).apply()
    }

    fun updateAge(age: String) {
        val filtered = age.filter { it.isDigit() }
        _uiState.value = _uiState.value.copy(age = filtered)
        prefs.edit().putString(PREF_AGE, filtered).apply()
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

    fun updateZone12(value: String) {
        val filtered = value.filter { it.isDigit() }
        _uiState.value = _uiState.value.copy(zone12 = filtered)
        filtered.toIntOrNull()?.let { prefs.edit().putInt(PREF_ZONE_1_2, it).apply() }
    }

    fun updateZone23(value: String) {
        val filtered = value.filter { it.isDigit() }
        _uiState.value = _uiState.value.copy(zone23 = filtered)
        filtered.toIntOrNull()?.let { prefs.edit().putInt(PREF_ZONE_2_3, it).apply() }
    }

    fun updateZone34(value: String) {
        val filtered = value.filter { it.isDigit() }
        _uiState.value = _uiState.value.copy(zone34 = filtered)
        filtered.toIntOrNull()?.let { prefs.edit().putInt(PREF_ZONE_3_4, it).apply() }
    }

    fun updateZone45(value: String) {
        val filtered = value.filter { it.isDigit() }
        _uiState.value = _uiState.value.copy(zone45 = filtered)
        filtered.toIntOrNull()?.let { prefs.edit().putInt(PREF_ZONE_4_5, it).apply() }
    }

    fun updateMaxHrOverride(value: String) {
        val filtered = value.filter { it.isDigit() }
        _uiState.value = _uiState.value.copy(maxHrOverride = filtered)
        prefs.edit().putInt(PREF_MAX_HR, filtered.toIntOrNull() ?: 0).apply()
    }

    private fun getRealmApi(baseUrl: String): RealmApi {
        val normalizedBase = baseUrl.trimEnd('/') + "/"
        if (cachedRetrofit == null || cachedRetrofitBaseUrl != normalizedBase) {
            cachedRetrofit = Retrofit.Builder()
                .baseUrl(normalizedBase)
                .addConverterFactory(GsonConverterFactory.create())
                .build()
            cachedRetrofitBaseUrl = normalizedBase
        }
        return cachedRetrofit!!.create(RealmApi::class.java)
    }

    fun join() {
        val state = _uiState.value
        if (state.playerName.isBlank()) {
            _uiState.value = state.copy(errorMessage = "Set up your profile first")
            return
        }
        if (state.joinCode.isBlank()) {
            _uiState.value = state.copy(errorMessage = "Enter a join code")
            return
        }
        if (state.serverUrl.isBlank()) {
            _uiState.value = state.copy(errorMessage = "No server connected")
            return
        }

        _uiState.value = state.copy(isLoading = true, errorMessage = null)

        viewModelScope.launch(Dispatchers.IO) {
            try {
                // 1. Connect to SignalR hub
                signalRClient.connect(state.serverUrl)

                if (signalRClient.connectionState.value != ConnectionState.CONNECTED) {
                    val err = signalRClient.error.value ?: "Could not connect to the server"
                    _uiState.value = _uiState.value.copy(isLoading = false, errorMessage = err)
                    return@launch
                }

                // 2. Clear stale errors before joining
                signalRClient.clearError()

                // 3. Join realm via SignalR with profile data
                val zoneBounds = doubleArrayOf(zone12 / 100.0, zone23 / 100.0, zone34 / 100.0, zone45 / 100.0)
                signalRClient.joinRealm(
                    state.joinCode,
                    state.clientId,
                    state.playerName,
                    state.age.toIntOrNull() ?: 0,
                    state.heightCm.toDoubleOrNull() ?: 0.0,
                    state.weightKg.toDoubleOrNull() ?: 0.0,
                    strideFactor,
                    strideCalibration,
                    zoneBounds,
                    maxHrOverride
                )

                // 3b. Give the server a moment to deliver JoinedCalibrationSession if applicable.
                //     The server sends this event on a different thread from blockingAwait, so
                //     the hub handler may not have fired yet when joinRealm() returns.
                //     200ms provides a reliable window without a perceptible UX delay.
                delay(200)

                // 3c. If this was a calibration join code, skip the REST call — calibration
                //     sessions are not realms and have no REST endpoint.
                val calibrationSessionId = signalRClient.calibrationSessionId.value
                if (calibrationSessionId != null) {
                    prefs.edit().putString(PREF_SERVER_URL, state.serverUrl).apply()
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        realmInfo = RealmInfo(
                            id = calibrationSessionId,
                            joinCode = state.joinCode,
                            mode = "calibration"
                        ),
                        isJoined = true
                    )
                    return@launch
                }

                // 4. Fetch realm info via REST to get the realmId
                val api = realmApiFactory(state.serverUrl)
                val realmInfo = api.getRealm(state.joinCode)

                // Cache the server URL on successful join
                prefs.edit().putString(PREF_SERVER_URL, state.serverUrl).apply()

                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    realmInfo = realmInfo,
                    isJoined = true
                )
            } catch (e: Exception) {
                signalRClient.disconnect()
                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    errorMessage = UserFriendlyErrors.fromException(e, "Could not join the realm")
                )
            }
        }
    }

    fun disconnect() {
        viewModelScope.launch(Dispatchers.IO) {
            signalRClient.disconnect()
        }
        _uiState.value = _uiState.value.copy(
            isJoined = false,
            realmInfo = null
        )
    }
}
