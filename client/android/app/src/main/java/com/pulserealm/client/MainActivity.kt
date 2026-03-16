package com.pulserealm.client

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.navigation.NavType
import androidx.navigation.navArgument
import androidx.wear.compose.navigation.SwipeDismissableNavHost
import androidx.wear.compose.navigation.composable
import androidx.wear.compose.navigation.rememberSwipeDismissableNavController
import com.pulserealm.client.ui.join.JoinScreen
import com.pulserealm.client.ui.session.RealmScreen
import dagger.hilt.android.AndroidEntryPoint

@AndroidEntryPoint
class MainActivity : ComponentActivity() {

    private val requiredPermissions = buildList {
        add(Manifest.permission.BODY_SENSORS)
        add(Manifest.permission.ACTIVITY_RECOGNITION)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            add(Manifest.permission.POST_NOTIFICATIONS)
        }
    }.toTypedArray()

    private val permissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { _ ->
        // Permissions handled — proceed regardless (sensor collector will simulate if denied)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Keep screen on to prevent Wear OS from destroying the activity during streaming
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        requestPermissionsIfNeeded()
        requestBatteryOptimizationExemption()

        setContent {
            val navController = rememberSwipeDismissableNavController()

            SwipeDismissableNavHost(
                navController = navController,
                startDestination = "join"
            ) {
                composable("join") {
                    JoinScreen(
                        onJoined = { realmId, clientId, serverUrl ->
                            navController.navigate(
                                "realm/$realmId/$clientId/${java.net.URLEncoder.encode(serverUrl, "UTF-8")}"
                            ) {
                                popUpTo("join") { inclusive = true }
                            }
                        }
                    )
                }

                composable(
                    route = "realm/{realmId}/{clientId}/{serverUrl}",
                    arguments = listOf(
                        navArgument("realmId") { type = NavType.StringType },
                        navArgument("clientId") { type = NavType.StringType },
                        navArgument("serverUrl") { type = NavType.StringType }
                    )
                ) {
                    RealmScreen(
                        onDisconnected = {
                            navController.navigate("join") {
                                popUpTo("realm/{realmId}/{clientId}/{serverUrl}") {
                                    inclusive = true
                                }
                            }
                        }
                    )
                }
            }
        }
    }

    private fun requestBatteryOptimizationExemption() {
        val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
        if (!powerManager.isIgnoringBatteryOptimizations(packageName)) {
            val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                data = Uri.parse("package:$packageName")
            }
            startActivity(intent)
        }
    }

    private fun requestPermissionsIfNeeded() {
        val missingPermissions = requiredPermissions.filter {
            ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
        }.toTypedArray()

        if (missingPermissions.isNotEmpty()) {
            permissionLauncher.launch(missingPermissions)
        }
    }
}
