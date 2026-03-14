package com.pulserealm.client

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
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
import com.pulserealm.client.ui.session.SessionScreen
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

        setContent {
            val navController = rememberSwipeDismissableNavController()

            SwipeDismissableNavHost(
                navController = navController,
                startDestination = "join"
            ) {
                composable("join") {
                    JoinScreen(
                        onJoined = { sessionId, clientId, serverUrl ->
                            navController.navigate(
                                "session/$sessionId/$clientId/${java.net.URLEncoder.encode(serverUrl, "UTF-8")}"
                            ) {
                                popUpTo("join") { inclusive = true }
                            }
                        }
                    )
                }

                composable(
                    route = "session/{sessionId}/{clientId}/{serverUrl}",
                    arguments = listOf(
                        navArgument("sessionId") { type = NavType.StringType },
                        navArgument("clientId") { type = NavType.StringType },
                        navArgument("serverUrl") { type = NavType.StringType }
                    )
                ) {
                    SessionScreen(
                        onDisconnected = {
                            navController.navigate("join") {
                                popUpTo("session/{sessionId}/{clientId}/{serverUrl}") {
                                    inclusive = true
                                }
                            }
                        }
                    )
                }
            }
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
