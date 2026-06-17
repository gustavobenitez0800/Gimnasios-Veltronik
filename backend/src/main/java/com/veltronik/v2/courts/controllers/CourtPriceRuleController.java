package com.veltronik.v2.courts.controllers;

import com.veltronik.v2.courts.dto.CourtPriceRuleDTO;
import com.veltronik.v2.courts.dto.CourtPriceRuleInputDTO;
import com.veltronik.v2.courts.entities.CourtPriceRule;
import com.veltronik.v2.courts.mappers.CourtsMapper;
import com.veltronik.v2.courts.services.CourtPriceRuleService;
import com.veltronik.v2.courts.services.CourtService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

/** API REST de reglas de precio por franja horaria. Config sensible: solo dueño/admin. */
@RestController
@RequestMapping("/api/courts/price-rules")
@PreAuthorize("hasAnyRole('OWNER','ADMIN')")
public class CourtPriceRuleController {

    private final CourtPriceRuleService ruleService;
    private final CourtService courtService;
    private final CourtsMapper mapper;

    public CourtPriceRuleController(CourtPriceRuleService ruleService,
                                    CourtService courtService,
                                    CourtsMapper mapper) {
        this.ruleService = ruleService;
        this.courtService = courtService;
        this.mapper = mapper;
    }

    @GetMapping
    public ResponseEntity<List<CourtPriceRuleDTO>> getAll() {
        return ResponseEntity.ok(mapper.toPriceRuleDtoList(ruleService.findAllForCurrentTenant()));
    }

    @PostMapping
    public ResponseEntity<CourtPriceRuleDTO> create(@Valid @RequestBody CourtPriceRuleInputDTO input) {
        CourtPriceRule rule = new CourtPriceRule();
        applyEditableFields(rule, input);
        return ResponseEntity.ok(mapper.toDto(ruleService.saveForCurrentTenant(rule)));
    }

    @PutMapping("/{id}")
    public ResponseEntity<CourtPriceRuleDTO> update(@PathVariable UUID id,
                                                    @Valid @RequestBody CourtPriceRuleInputDTO input) {
        CourtPriceRule rule = ruleService.findByIdAndVerifyOwnership(id);
        applyEditableFields(rule, input);
        return ResponseEntity.ok(mapper.toDto(ruleService.saveForCurrentTenant(rule)));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable UUID id) {
        ruleService.deleteAndVerifyOwnership(id);
        return ResponseEntity.noContent().build();
    }

    private void applyEditableFields(CourtPriceRule rule, CourtPriceRuleInputDTO in) {
        // courtId/dayOfWeek null SIGNIFICAN "todas las canchas"/"todos los días" → se asignan siempre.
        rule.setCourt(in.getCourtId() != null ? courtService.findByIdAndVerifyOwnership(in.getCourtId()) : null);
        rule.setDayOfWeek(in.getDayOfWeek());
        if (in.getTimeFrom() != null) rule.setTimeFrom(in.getTimeFrom());
        if (in.getTimeTo() != null) rule.setTimeTo(in.getTimeTo());
        if (in.getPrice() != null) rule.setPrice(in.getPrice());
    }
}
