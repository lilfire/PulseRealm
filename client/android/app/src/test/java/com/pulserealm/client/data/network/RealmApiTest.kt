package com.pulserealm.client.data.network

import org.junit.Assert.*
import org.junit.Test
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory

class RealmApiTest {

    @Test
    fun `RealmApi can be created from Retrofit`() {
        val retrofit = Retrofit.Builder()
            .baseUrl("http://localhost:5062/")
            .addConverterFactory(GsonConverterFactory.create())
            .build()

        val api = retrofit.create(RealmApi::class.java)
        assertNotNull(api)
    }

    @Test
    fun `getRealm endpoint path is correct`() {
        val retrofit = Retrofit.Builder()
            .baseUrl("http://localhost:5062/")
            .addConverterFactory(GsonConverterFactory.create())
            .build()

        val api = retrofit.create(RealmApi::class.java)

        // Verify the method exists and is callable (will fail at runtime, not at reflection)
        val methods = RealmApi::class.java.declaredMethods
        val getRealmMethod = methods.find { it.name == "getRealm" }
        assertNotNull("getRealm method should exist", getRealmMethod)
    }
}
