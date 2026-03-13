package com.pulserealm.client.di

import android.content.Context
import android.hardware.SensorManager
import com.pulserealm.client.data.network.SignalRClient
import com.pulserealm.client.data.sensor.SensorDataCollector
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object AppModule {

    @Provides
    @Singleton
    fun provideSignalRClient(): SignalRClient {
        return SignalRClient()
    }

    @Provides
    @Singleton
    fun provideSensorManager(@ApplicationContext context: Context): SensorManager {
        return context.getSystemService(Context.SENSOR_SERVICE) as SensorManager
    }

    @Provides
    @Singleton
    fun provideSensorDataCollector(sensorManager: SensorManager): SensorDataCollector {
        return SensorDataCollector(sensorManager)
    }
}
