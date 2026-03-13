# SignalR
-keep class com.microsoft.signalr.** { *; }
-dontwarn com.microsoft.signalr.**

# Retrofit
-keepattributes Signature
-keepattributes *Annotation*
-keep class retrofit2.** { *; }
-dontwarn retrofit2.**

# Gson
-keep class com.pulserealm.client.data.model.** { *; }
-keepclassmembers class com.pulserealm.client.data.model.** { *; }

# OkHttp (used by SignalR and Retrofit)
-dontwarn okhttp3.**
-dontwarn okio.**
