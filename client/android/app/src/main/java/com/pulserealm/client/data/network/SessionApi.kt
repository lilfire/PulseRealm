package com.pulserealm.client.data.network

import com.pulserealm.client.data.model.RealmInfo
import retrofit2.http.GET
import retrofit2.http.Path

interface RealmApi {
    @GET("api/realm/{joinCode}")
    suspend fun getRealm(@Path("joinCode") joinCode: String): RealmInfo
}
