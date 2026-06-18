-- V28__Kiosk_Suppliers.sql
-- Fase 2 del kiosco: PROVEEDORES y COMPRAS. La compra repone stock (movimientos PURCHASE) y
-- actualiza el costo del producto → la rentabilidad refleja la realidad.

CREATE TABLE kiosk_supplier (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(30),
    cuit VARCHAR(20),
    notes TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    CONSTRAINT fk_kiosk_supplier_tenant FOREIGN KEY (tenant_id) REFERENCES tenant(id) ON DELETE CASCADE
);

-- Cabecera de la compra (remito/factura del proveedor).
CREATE TABLE kiosk_purchase (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    supplier_id UUID,
    purchase_date DATE NOT NULL,
    total NUMERIC(14,2) NOT NULL DEFAULT 0,
    notes TEXT,
    created_by UUID,
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    CONSTRAINT fk_kiosk_purchase_tenant FOREIGN KEY (tenant_id) REFERENCES tenant(id) ON DELETE CASCADE,
    CONSTRAINT fk_kiosk_purchase_supplier FOREIGN KEY (supplier_id) REFERENCES kiosk_supplier(id) ON DELETE SET NULL
);

-- Renglones de la compra. Snapshot del nombre (historial inmutable).
CREATE TABLE kiosk_purchase_item (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    purchase_id UUID NOT NULL,
    product_id UUID,
    product_name_snapshot VARCHAR(255) NOT NULL,
    quantity NUMERIC(12,3) NOT NULL,
    unit_cost NUMERIC(12,2) NOT NULL,
    subtotal NUMERIC(14,2) NOT NULL,
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    CONSTRAINT fk_kiosk_purchase_item_tenant FOREIGN KEY (tenant_id) REFERENCES tenant(id) ON DELETE CASCADE,
    CONSTRAINT fk_kiosk_purchase_item_purchase FOREIGN KEY (purchase_id) REFERENCES kiosk_purchase(id) ON DELETE CASCADE,
    CONSTRAINT fk_kiosk_purchase_item_product FOREIGN KEY (product_id) REFERENCES kiosk_product(id) ON DELETE SET NULL,
    CONSTRAINT chk_kiosk_purchase_item_qty CHECK (quantity > 0)
);

CREATE INDEX idx_kiosk_supplier_tenant ON kiosk_supplier(tenant_id);
CREATE INDEX idx_kiosk_purchase_tenant_date ON kiosk_purchase(tenant_id, purchase_date);
CREATE INDEX idx_kiosk_purchase_supplier ON kiosk_purchase(supplier_id);
CREATE INDEX idx_kiosk_purchase_item_purchase ON kiosk_purchase_item(purchase_id);
