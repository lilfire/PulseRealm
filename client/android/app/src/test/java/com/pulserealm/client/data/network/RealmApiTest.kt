package com.pulserealm.client.data.network

import org.junit.Assert.*
import org.junit.Test
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import retrofit2.http.GET
import retrofit2.http.Path

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
    fun `getRealm method exists`() {
        val methods = RealmApi::class.java.declaredMethods
        val getRealmMethod = methods.find { it.name == "getRealm" }
        assertNotNull("getRealm method should exist", getRealmMethod)
    }

    @Test
    fun `getRealm has GET annotation with correct path`() {
        val method = RealmApi::class.java.declaredMethods.find { it.name == "getRealm" }!!
        val getAnnotation = method.getAnnotation(GET::class.java)

        assertNotNull("getRealm should have @GET annotation", getAnnotation)
        assertEquals("api/realm/{joinCode}", getAnnotation!!.value)
    }

    @Test
    fun `getRealm has Path annotation for joinCode parameter`() {
        val method = RealmApi::class.java.declaredMethods.find { it.name == "getRealm" }!!

        val pathAnnotations = method.parameterAnnotations.flatMap { it.toList() }
            .filterIsInstance<Path>()

        assertTrue("getRealm should have @Path annotation", pathAnnotations.isNotEmpty())
        assertEquals("joinCode", pathAnnotations.first().value)
    }

    @Test
    fun `RealmApi is an interface`() {
        assertTrue(RealmApi::class.java.isInterface)
    }

    @Test
    fun `getRealm returns suspend function`() {
        // Suspend functions in Kotlin compile to a method with a Continuation parameter
        val method = RealmApi::class.java.declaredMethods.find { it.name == "getRealm" }!!
        val paramTypes = method.parameterTypes
        val hasContinuation = paramTypes.any { it.name.contains("Continuation") }
        assertTrue("getRealm should be a suspend function", hasContinuation)
    }
}
