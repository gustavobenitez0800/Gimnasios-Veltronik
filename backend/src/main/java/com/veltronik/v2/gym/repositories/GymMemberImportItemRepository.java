package com.veltronik.v2.gym.repositories;

import com.veltronik.v2.gym.entities.GymMemberImportItem;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface GymMemberImportItemRepository extends JpaRepository<GymMemberImportItem, UUID> {

    List<GymMemberImportItem> findByImportId(UUID importId);
}
