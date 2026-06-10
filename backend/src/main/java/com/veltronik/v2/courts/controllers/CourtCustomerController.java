package com.veltronik.v2.courts.controllers;

import com.veltronik.v2.courts.dto.CourtCustomerDTO;
import com.veltronik.v2.courts.dto.CourtCustomerInputDTO;
import com.veltronik.v2.courts.entities.CourtCustomer;
import com.veltronik.v2.courts.mappers.CourtsMapper;
import com.veltronik.v2.courts.services.CourtCustomerService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

/** API REST de clientes del complejo. */
@RestController
@RequestMapping("/api/courts/customers")
public class CourtCustomerController {

    private final CourtCustomerService customerService;
    private final CourtsMapper mapper;

    public CourtCustomerController(CourtCustomerService customerService, CourtsMapper mapper) {
        this.customerService = customerService;
        this.mapper = mapper;
    }

    @GetMapping
    public ResponseEntity<List<CourtCustomerDTO>> getAll(@RequestParam(required = false) String q) {
        List<CourtCustomer> customers = (q == null || q.isBlank())
                ? customerService.findAllForCurrentTenant()
                : customerService.searchForCurrentTenant(q);
        return ResponseEntity.ok(mapper.toCustomerDtoList(customers));
    }

    @GetMapping("/{id}")
    public ResponseEntity<CourtCustomerDTO> getById(@PathVariable UUID id) {
        return ResponseEntity.ok(mapper.toDto(customerService.findByIdAndVerifyOwnership(id)));
    }

    @PostMapping
    public ResponseEntity<CourtCustomerDTO> create(@Valid @RequestBody CourtCustomerInputDTO input) {
        CourtCustomer customer = new CourtCustomer();
        applyEditableFields(customer, input);
        return ResponseEntity.ok(mapper.toDto(customerService.saveForCurrentTenant(customer)));
    }

    @PutMapping("/{id}")
    public ResponseEntity<CourtCustomerDTO> update(@PathVariable UUID id,
                                                   @Valid @RequestBody CourtCustomerInputDTO input) {
        CourtCustomer customer = customerService.findByIdAndVerifyOwnership(id);
        applyEditableFields(customer, input);
        return ResponseEntity.ok(mapper.toDto(customerService.saveForCurrentTenant(customer)));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable UUID id) {
        customerService.deleteAndVerifyOwnership(id);
        return ResponseEntity.noContent().build();
    }

    private void applyEditableFields(CourtCustomer c, CourtCustomerInputDTO in) {
        if (in.getFullName() != null) c.setFullName(in.getFullName());
        if (in.getPhone() != null) c.setPhone(in.getPhone()); // se normaliza en el service
        if (in.getEmail() != null) c.setEmail(in.getEmail());
        if (in.getNotes() != null) c.setNotes(in.getNotes());
    }
}
