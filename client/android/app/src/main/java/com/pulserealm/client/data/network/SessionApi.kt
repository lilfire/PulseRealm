package com.pulserealm.client.data.network

import com.pulserealm.client.data.model.SessionInfo
import retrofit2.http.GET
import retrofit2.http.Path

interface SessionApi {
    @GET("api/session/{joinCode}")
    suspend fun getSession(@Path("joinCode") joinCode: String): SessionInfo
}
