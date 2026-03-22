package com.pulserealm.client

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.navigation.NavType
import androidx.navigation.navArgument
import androidx.wear.compose.navigation.SwipeDismissableNavHost
import androidx.wear.compose.navigation.composable
import androidx.wear.compose.navigation.rememberSwipeDismissableNavController
import com.pulserealm.client.ui.setup.ProfileSetupScreen
import com.pulserealm.client.ui.server.ServerScreen
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

        requestPermissionsIfNeeded()

        setContent {
            val navController = rememberSwipeDismissableNavController()

            SwipeDismissableNavHost(
                navController = navController,
                startDestination = "profile_setup"
            ) {
                composable("profile_setup") {
                    ProfileSetupScreen(
                        onComplete = {
                            navController.navigate("server?skipAutoConnect=false") {
                                popUpTo("profile_setup") { inclusive = true }
                            }
                        }
                    )
                }

                composable(
                    route = "server?skipAutoConnect={skipAutoConnect}",
                    arguments = listOf(
                        navArgument("skipAutoConnect") {
                            type = NavType.BoolType
                            defaultValue = false
                        }
                    )
                ) {
                    ServerScreen(
                        onConnected = { serverUrl ->
                            val encodedUrl = java.net.URLEncoder.encode(serverUrl, "UTF-8")
                            navController.navigate("join?serverUrl=$encodedUrl") {
                                popUpTo("server?skipAutoConnect={skipAutoConnect}") { inclusive = true }
                            }
                        }
                    )
                }

                composable(
                    route = "join?serverUrl={serverUrl}",
                    arguments = listOf(
                        navArgument("serverUrl") { type = NavType.StringType }
                    )
                ) {
                    JoinScreen(
                        onJoined = { realmId, clientId, serverUrl ->
                            val encodedUrl = java.net.URLEncoder.encode(serverUrl, "UTF-8")
                            navController.navigate(
                                "realm?realmId=$realmId&clientId=$clientId&serverUrl=$encodedUrl"
                            ) {
                                popUpTo("join?serverUrl={serverUrl}") { inclusive = true }
                            }
                        },
                        onChangeServer = {
                            navController.navigate("server?skipAutoConnect=true") {
                                popUpTo("join?serverUrl={serverUrl}") { inclusive = true }
                            }
                        }
                    )
                }

                composable(
                    route = "realm?realmId={realmId}&clientId={clientId}&serverUrl={serverUrl}",
                    arguments = listOf(
                        navArgument("realmId") { type = NavType.StringType },
                        navArgument("clientId") { type = NavType.StringType },
                        navArgument("serverUrl") { type = NavType.StringType }
                    )
                ) {
                    RealmScreen(
                        onDisconnected = {
                            navController.navigate("server?skipAutoConnect=false") {
                                popUpTo("realm?realmId={realmId}&clientId={clientId}&serverUrl={serverUrl}") {
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
