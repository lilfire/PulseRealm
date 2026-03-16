package com.pulserealm.client.data.model

data class RealmInfo(
    val id: String,
    val joinCode: String,
    val mode: String,
    val createdAt: String,
    val connectedClientIds: List<String>
)
