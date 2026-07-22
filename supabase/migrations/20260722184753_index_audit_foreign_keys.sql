-- Cover foreign-key columns reported by the database advisor. These indexes
-- keep parent-row updates/deletes and audit joins from scanning entire tables
-- as the operation history grows.

create index shop_candidate_deletion_audit_deleted_by_idx
  on private.shop_candidate_deletion_audit (deleted_by);

create index shop_deletion_audit_deleted_by_idx
  on private.shop_deletion_audit (deleted_by);

create index shop_update_audit_changed_by_idx
  on private.shop_update_audit (changed_by);

create index price_correction_requests_replacement_record_idx
  on public.price_correction_requests (replacement_price_record_id);
