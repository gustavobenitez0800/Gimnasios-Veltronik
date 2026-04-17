-- ============================================
-- VELTRONIK - SCHEMA: RESTAURANTE
-- Base de datos en Supabase (PostgreSQL)
-- ============================================
-- Ejecutar en Supabase SQL Editor.
-- Requiere que la tabla gyms ya exista.
-- ============================================

-- 1. ÁREAS DEL RESTAURANTE
CREATE TABLE IF NOT EXISTS restaurant_areas (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    sort_order INT DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_areas_org ON restaurant_areas(org_id);

-- 2. PERSONAL DEL RESTAURANTE (antes de mesas por FK)
CREATE TABLE IF NOT EXISTS restaurant_staff (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    role TEXT DEFAULT 'waiter',
    phone TEXT,
    email TEXT,
    is_active BOOLEAN DEFAULT true,
    pin_code TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_staff_org ON restaurant_staff(org_id);

-- 3. MESAS
CREATE TABLE IF NOT EXISTS restaurant_tables (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
    area_id UUID REFERENCES restaurant_areas(id) ON DELETE SET NULL,
    table_number TEXT NOT NULL,
    capacity INT DEFAULT 4,
    status TEXT DEFAULT 'available',
    pos_x INT DEFAULT 0,
    pos_y INT DEFAULT 0,
    shape TEXT DEFAULT 'square',
    assigned_waiter_id UUID REFERENCES restaurant_staff(id) ON DELETE SET NULL,
    current_order_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tables_org ON restaurant_tables(org_id);
CREATE INDEX IF NOT EXISTS idx_tables_status ON restaurant_tables(org_id, status);

-- 4. CATEGORÍAS DEL MENÚ
CREATE TABLE IF NOT EXISTS menu_categories (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    icon TEXT,
    sort_order INT DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_menu_cat_org ON menu_categories(org_id);

-- 5. PLATOS DEL MENÚ
CREATE TABLE IF NOT EXISTS menu_items (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
    category_id UUID REFERENCES menu_categories(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    description TEXT,
    price DECIMAL(10,2) NOT NULL,
    cost DECIMAL(10,2) DEFAULT 0,
    photo_url TEXT,
    prep_time_min INT DEFAULT 15,
    allergens TEXT[] DEFAULT '{}',
    tags TEXT[] DEFAULT '{}',
    is_available BOOLEAN DEFAULT true,
    is_featured BOOLEAN DEFAULT false,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_menu_items_org ON menu_items(org_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_cat ON menu_items(category_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_available ON menu_items(org_id, is_available);

-- 6. MODIFICADORES / EXTRAS
CREATE TABLE IF NOT EXISTS menu_modifiers (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    price_adjustment DECIMAL(10,2) DEFAULT 0,
    modifier_group TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_modifiers_org ON menu_modifiers(org_id);

-- 7. PEDIDOS
CREATE TABLE IF NOT EXISTS restaurant_orders (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
    table_id UUID REFERENCES restaurant_tables(id) ON DELETE SET NULL,
    order_number SERIAL,
    order_type TEXT DEFAULT 'dine_in',
    status TEXT DEFAULT 'pending',
    waiter_id UUID REFERENCES restaurant_staff(id) ON DELETE SET NULL,
    customer_name TEXT,
    customer_count INT DEFAULT 1,
    subtotal DECIMAL(10,2) DEFAULT 0,
    discount DECIMAL(10,2) DEFAULT 0,
    discount_reason TEXT,
    tip DECIMAL(10,2) DEFAULT 0,
    total DECIMAL(10,2) DEFAULT 0,
    payment_method TEXT,
    payment_status TEXT DEFAULT 'pending',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    served_at TIMESTAMPTZ,
    paid_at TIMESTAMPTZ,
    closed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_orders_org ON restaurant_orders(org_id);
CREATE INDEX IF NOT EXISTS idx_orders_table ON restaurant_orders(table_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON restaurant_orders(org_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_date ON restaurant_orders(created_at);

-- 8. ÍTEMS DEL PEDIDO
CREATE TABLE IF NOT EXISTS order_items (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    order_id UUID NOT NULL REFERENCES restaurant_orders(id) ON DELETE CASCADE,
    menu_item_id UUID REFERENCES menu_items(id) ON DELETE SET NULL,
    item_name TEXT NOT NULL,
    quantity INT DEFAULT 1,
    unit_price DECIMAL(10,2) NOT NULL,
    modifiers JSONB DEFAULT '[]',
    notes TEXT,
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    ready_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_status ON order_items(status);

-- 9. INVENTARIO
CREATE TABLE IF NOT EXISTS inventory_items (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    unit TEXT DEFAULT 'unidad',
    current_stock DECIMAL(10,3) DEFAULT 0,
    minimum_stock DECIMAL(10,3) DEFAULT 0,
    cost_per_unit DECIMAL(10,2) DEFAULT 0,
    supplier TEXT,
    category TEXT,
    last_restocked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_inventory_org ON inventory_items(org_id);

-- 10. RECETAS
CREATE TABLE IF NOT EXISTS recipe_ingredients (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    menu_item_id UUID NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
    inventory_item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
    quantity_needed DECIMAL(10,3) NOT NULL,
    unit TEXT
);
CREATE INDEX IF NOT EXISTS idx_recipe_menu ON recipe_ingredients(menu_item_id);

-- 11. MOVIMIENTOS DE INVENTARIO
CREATE TABLE IF NOT EXISTS inventory_movements (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
    inventory_item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
    movement_type TEXT NOT NULL,
    quantity DECIMAL(10,3) NOT NULL,
    unit_cost DECIMAL(10,2),
    notes TEXT,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_inv_mov_org ON inventory_movements(org_id);
CREATE INDEX IF NOT EXISTS idx_inv_mov_item ON inventory_movements(inventory_item_id);

-- 12. RESERVAS
CREATE TABLE IF NOT EXISTS reservations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
    table_id UUID REFERENCES restaurant_tables(id) ON DELETE SET NULL,
    customer_name TEXT NOT NULL,
    customer_phone TEXT,
    customer_email TEXT,
    party_size INT DEFAULT 2,
    reservation_date DATE NOT NULL,
    reservation_time TIME NOT NULL,
    duration_min INT DEFAULT 90,
    status TEXT DEFAULT 'confirmed',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_reservations_org ON reservations(org_id);
CREATE INDEX IF NOT EXISTS idx_reservations_date ON reservations(org_id, reservation_date);

-- 13. CAJA DIARIA
CREATE TABLE IF NOT EXISTS cash_register (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
    opened_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    closed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    opening_amount DECIMAL(10,2) DEFAULT 0,
    closing_amount DECIMAL(10,2),
    expected_amount DECIMAL(10,2),
    difference DECIMAL(10,2),
    total_cash DECIMAL(10,2) DEFAULT 0,
    total_card DECIMAL(10,2) DEFAULT 0,
    total_transfer DECIMAL(10,2) DEFAULT 0,
    total_mercadopago DECIMAL(10,2) DEFAULT 0,
    total_tips DECIMAL(10,2) DEFAULT 0,
    orders_count INT DEFAULT 0,
    status TEXT DEFAULT 'open',
    opened_at TIMESTAMPTZ DEFAULT NOW(),
    closed_at TIMESTAMPTZ,
    notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_cash_org ON cash_register(org_id);
CREATE INDEX IF NOT EXISTS idx_cash_status ON cash_register(org_id, status);

-- 14. ROW LEVEL SECURITY
ALTER TABLE restaurant_areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurant_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_modifiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurant_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurant_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_register ENABLE ROW LEVEL SECURITY;

CREATE POLICY restaurant_areas_all ON restaurant_areas FOR ALL USING (
    EXISTS (SELECT 1 FROM organization_members WHERE organization_id = restaurant_areas.org_id AND user_id = auth.uid())
);
CREATE POLICY restaurant_tables_all ON restaurant_tables FOR ALL USING (
    EXISTS (SELECT 1 FROM organization_members WHERE organization_id = restaurant_tables.org_id AND user_id = auth.uid())
);
CREATE POLICY menu_categories_all ON menu_categories FOR ALL USING (
    EXISTS (SELECT 1 FROM organization_members WHERE organization_id = menu_categories.org_id AND user_id = auth.uid())
);
CREATE POLICY menu_items_all ON menu_items FOR ALL USING (
    EXISTS (SELECT 1 FROM organization_members WHERE organization_id = menu_items.org_id AND user_id = auth.uid())
);
CREATE POLICY menu_modifiers_all ON menu_modifiers FOR ALL USING (
    EXISTS (SELECT 1 FROM organization_members WHERE organization_id = menu_modifiers.org_id AND user_id = auth.uid())
);
CREATE POLICY restaurant_staff_all ON restaurant_staff FOR ALL USING (
    EXISTS (SELECT 1 FROM organization_members WHERE organization_id = restaurant_staff.org_id AND user_id = auth.uid())
);
CREATE POLICY restaurant_orders_all ON restaurant_orders FOR ALL USING (
    EXISTS (SELECT 1 FROM organization_members WHERE organization_id = restaurant_orders.org_id AND user_id = auth.uid())
);
CREATE POLICY order_items_all ON order_items FOR ALL USING (
    EXISTS (
        SELECT 1 FROM restaurant_orders ro
        JOIN organization_members om ON om.organization_id = ro.org_id
        WHERE ro.id = order_items.order_id AND om.user_id = auth.uid()
    )
);
CREATE POLICY inventory_items_all ON inventory_items FOR ALL USING (
    EXISTS (SELECT 1 FROM organization_members WHERE organization_id = inventory_items.org_id AND user_id = auth.uid())
);
CREATE POLICY recipe_ingredients_all ON recipe_ingredients FOR ALL USING (
    EXISTS (
        SELECT 1 FROM menu_items mi
        JOIN organization_members om ON om.organization_id = mi.org_id
        WHERE mi.id = recipe_ingredients.menu_item_id AND om.user_id = auth.uid()
    )
);
CREATE POLICY inventory_movements_all ON inventory_movements FOR ALL USING (
    EXISTS (SELECT 1 FROM organization_members WHERE organization_id = inventory_movements.org_id AND user_id = auth.uid())
);
CREATE POLICY reservations_all ON reservations FOR ALL USING (
    EXISTS (SELECT 1 FROM organization_members WHERE organization_id = reservations.org_id AND user_id = auth.uid())
);
CREATE POLICY cash_register_all ON cash_register FOR ALL USING (
    EXISTS (SELECT 1 FROM organization_members WHERE organization_id = cash_register.org_id AND user_id = auth.uid())
);
