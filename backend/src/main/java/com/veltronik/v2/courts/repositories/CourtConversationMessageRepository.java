package com.veltronik.v2.courts.repositories;

import com.veltronik.v2.courts.entities.CourtConversationMessage;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface CourtConversationMessageRepository extends JpaRepository<CourtConversationMessage, UUID> {

    /** Idempotencia: ¿ya procesamos este mensaje entrante de Meta? */
    boolean existsByWaMessageId(String waMessageId);

    /** Últimos N mensajes de una conversación (desc) — la memoria que se le pasa a Gemini. */
    List<CourtConversationMessage> findTop20ByConversationIdOrderByCreatedAtDesc(UUID conversationId);
}
