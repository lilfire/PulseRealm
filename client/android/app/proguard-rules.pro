# SignalR
-keep class com.microsoft.signalr.** { *; }
-dontwarn com.microsoft.signalr.**

# Retrofit
-keepattributes Signature
-keepattributes *Annotation*
-keep class retrofit2.** { *; }
-dontwarn retrofit2.**

# Gson — keep model and network data classes used for serialization
-keep class com.pulserealm.client.data.model.** { *; }
-keepclassmembers class com.pulserealm.client.data.model.** { *; }
-keep class com.pulserealm.client.data.network.ClientSummaryData { *; }
-keep class com.pulserealm.client.data.network.RealmSummaryData { *; }
-keep class com.pulserealm.client.data.network.DiscoveredServer { *; }

# OkHttp (used by SignalR and Retrofit)
-dontwarn okhttp3.**
-dontwarn okio.**
