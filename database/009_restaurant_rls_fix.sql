-- ============================================
-- VELTRONIK - FIX 009: RESTAURANT RLS POLICIES
-- ============================================
-- Arregla policies que usan FOR ALL sin WITH CHECK en el esquema de restaurante.
-- FOR ALL = SELECT + INSERT + UPDATE + DELETE
-- Sin WITH CHECK, los INSERT fallan silenciosamente o son vulnerables.
-- ============================================

-- Función helper para simplificar las policies
CREATE OR REPLACE FUNCTION user_belongs_to_org(org_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.organization_members 
        WHERE organization_id = org_id AND user_id = auth.uid()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 1. RESTAURANT AREAS
DROP POLICY IF EXISTS restaurant_areas_all ON restaurant_areas;
CREATE POLICY areas_select ON restaurant_areas FOR SELECT USING (user_belongs_to_org(org_id));
CREATE POLICY areas_insert ON restaurant_areas FOR INSERT WITH CHECK (user_belongs_to_org(org_id));
CREATE POLICY areas_update ON restaurant_areas FOR UPDATE USING (user_belongs_to_org(org_id));
CREATE POLICY areas_delete ON restaurant_areas FOR DELETE USING (user_belongs_to_org(org_id));

-- 2. RESTAURANT TABLES
DROP POLICY IF EXISTS restaurant_tables_all ON restaurant_tables;
CREATE POLICY tables_select ON restaurant_tables FOR SELECT USING (user_belongs_to_org(org_id));
CREATE POLICY tables_insert ON restaurant_tables FOR INSERT WITH CHECK (user_belongs_to_org(org_id));
CREATE POLICY tables_update ON restaurant_tables FOR UPDATE USING (user_belongs_to_org(org_id));
CREATE POLICY tables_delete ON restaurant_tables FOR DELETE USING (user_belongs_to_org(org_id));

-- 3. MENU CATEGORIES
DROP POLICY IF EXISTS menu_categories_all ON menu_categories;
CREATE POLICY categories_select ON menu_categories FOR SELECT USING (user_belongs_to_org(org_id));
CREATE POLICY categories_insert ON menu_categories FOR INSERT WITH CHECK (user_belongs_to_org(org_id));
CREATE POLICY categories_update ON menu_categories FOR UPDATE USING (user_belongs_to_org(org_id));
CREATE POLICY categories_delete ON menu_categories FOR DELETE USING (user_belongs_to_org(org_id));

-- 4. MENU ITEMS
DROP POLICY IF EXISTS menu_items_all ON menu_items;
CREATE POLICY items_select ON menu_items FOR SELECT USING (user_belongs_to_org(org_id));
CREATE POLICY items_insert ON menu_items FOR INSERT WITH CHECK (user_belongs_to_org(org_id));
CREATE POLICY items_update ON menu_items FOR UPDATE USING (user_belongs_to_org(org_id));
CREATE POLICY items_delete ON menu_items FOR DELETE USING (user_belongs_to_org(org_id));

-- 5. MENU MODIFIERS
DROP POLICY IF EXISTS menu_modifiers_all ON menu_modifiers;
CREATE POLICY modifiers_select ON menu_modifiers FOR SELECT USING (user_belongs_to_org(org_id));
CREATE POLICY modifiers_insert ON menu_modifiers FOR INSERT WITH CHECK (user_belongs_to_org(org_id));
CREATE POLICY modifiers_update ON menu_modifiers FOR UPDATE USING (user_belongs_to_org(org_id));
CREATE POLICY modifiers_delete ON menu_modifiers FOR DELETE USING (user_belongs_to_org(org_id));

-- 6. RESTAURANT STAFF
DROP POLICY IF EXISTS restaurant_staff_all ON restaurant_staff;
CREATE POLICY staff_select ON restaurant_staff FOR SELECT USING (user_belongs_to_org(org_id));
CREATE POLICY staff_insert ON restaurant_staff FOR INSERT WITH CHECK (user_belongs_to_org(org_id));
CREATE POLICY staff_update ON restaurant_staff FOR UPDATE USING (user_belongs_to_org(org_id));
CREATE POLICY staff_delete ON restaurant_staff FOR DELETE USING (user_belongs_to_org(org_id));

-- 7. RESTAURANT ORDERS
DROP POLICY IF EXISTS restaurant_orders_all ON restaurant_orders;
CREATE POLICY orders_select ON restaurant_orders FOR SELECT USING (user_belongs_to_org(org_id));
CREATE POLICY orders_insert ON restaurant_orders FOR INSERT WITH CHECK (user_belongs_to_org(org_id));
CREATE POLICY orders_update ON restaurant_orders FOR UPDATE USING (user_belongs_to_org(org_id));
CREATE POLICY orders_delete ON restaurant_orders FOR DELETE USING (user_belongs_to_org(org_id));

-- 8. ORDER ITEMS
DROP POLICY IF EXISTS order_items_all ON order_items;
CREATE POLICY order_items_select ON order_items FOR SELECT USING (
    EXISTS (SELECT 1 FROM restaurant_orders ro WHERE ro.id = order_id AND user_belongs_to_org(ro.org_id))
);
CREATE POLICY order_items_insert ON order_items FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM restaurant_orders ro WHERE ro.id = order_id AND user_belongs_to_org(ro.org_id))
);
CREATE POLICY order_items_update ON order_items FOR UPDATE USING (
    EXISTS (SELECT 1 FROM restaurant_orders ro WHERE ro.id = order_id AND user_belongs_to_org(ro.org_id))
);
CREATE POLICY order_items_delete ON order_items FOR DELETE USING (
    EXISTS (SELECT 1 FROM restaurant_orders ro WHERE ro.id = order_id AND user_belongs_to_org(ro.org_id))
);

-- 9. INVENTORY ITEMS
DROP POLICY IF EXISTS inventory_items_all ON inventory_items;
CREATE POLICY inventory_select ON inventory_items FOR SELECT USING (user_belongs_to_org(org_id));
CREATE POLICY inventory_insert ON inventory_items FOR INSERT WITH CHECK (user_belongs_to_org(org_id));
CREATE POLICY inventory_update ON inventory_items FOR UPDATE USING (user_belongs_to_org(org_id));
CREATE POLICY inventory_delete ON inventory_items FOR DELETE USING (user_belongs_to_org(org_id));

-- 10. RECIPE INGREDIENTS
DROP POLICY IF EXISTS recipe_ingredients_all ON recipe_ingredients;
CREATE POLICY recipe_select ON recipe_ingredients FOR SELECT USING (
    EXISTS (SELECT 1 FROM menu_items mi WHERE mi.id = menu_item_id AND user_belongs_to_org(mi.org_id))
);
CREATE POLICY recipe_insert ON recipe_ingredients FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM menu_items mi WHERE mi.id = menu_item_id AND user_belongs_to_org(mi.org_id))
);
CREATE POLICY recipe_update ON recipe_ingredients FOR UPDATE USING (
    EXISTS (SELECT 1 FROM menu_items mi WHERE mi.id = menu_item_id AND user_belongs_to_org(mi.org_id))
);
CREATE POLICY recipe_delete ON recipe_ingredients FOR DELETE USING (
    EXISTS (SELECT 1 FROM menu_items mi WHERE mi.id = menu_item_id AND user_belongs_to_org(mi.org_id))
);

-- 11. INVENTORY MOVEMENTS
DROP POLICY IF EXISTS inventory_movements_all ON inventory_movements;
CREATE POLICY inv_mov_select ON inventory_movements FOR SELECT USING (user_belongs_to_org(org_id));
CREATE POLICY inv_mov_insert ON inventory_movements FOR INSERT WITH CHECK (user_belongs_to_org(org_id));
CREATE POLICY inv_mov_update ON inventory_movements FOR UPDATE USING (user_belongs_to_org(org_id));
CREATE POLICY inv_mov_delete ON inventory_movements FOR DELETE USING (user_belongs_to_org(org_id));

-- 12. RESERVATIONS
DROP POLICY IF EXISTS reservations_all ON reservations;
CREATE POLICY reservations_select ON reservations FOR SELECT USING (user_belongs_to_org(org_id));
CREATE POLICY reservations_insert ON reservations FOR INSERT WITH CHECK (user_belongs_to_org(org_id));
CREATE POLICY reservations_update ON reservations FOR UPDATE USING (user_belongs_to_org(org_id));
CREATE POLICY reservations_delete ON reservations FOR DELETE USING (user_belongs_to_org(org_id));

-- 13. CASH REGISTER
DROP POLICY IF EXISTS cash_register_all ON cash_register;
CREATE POLICY cash_register_select ON cash_register FOR SELECT USING (user_belongs_to_org(org_id));
CREATE POLICY cash_register_insert ON cash_register FOR INSERT WITH CHECK (user_belongs_to_org(org_id));
CREATE POLICY cash_register_update ON cash_register FOR UPDATE USING (user_belongs_to_org(org_id));
CREATE POLICY cash_register_delete ON cash_register FOR DELETE USING (user_belongs_to_org(org_id));
