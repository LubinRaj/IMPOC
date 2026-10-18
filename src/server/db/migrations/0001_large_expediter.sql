ALTER TABLE "inventory_vms" ADD CONSTRAINT "inventory_status_valid" CHECK ("inventory_vms"."lifecycle_status" in ('active','orphaned','decommissioned'));--> statement-breakpoint
ALTER TABLE "inventory_vms" ADD CONSTRAINT "inventory_missing_nonnegative" CHECK ("inventory_vms"."consecutive_missing_scans">=0);--> statement-breakpoint
ALTER TABLE "provider_scopes" ADD CONSTRAINT "provider_valid" CHECK ("provider_scopes"."provider" in ('aws','azure','gcp','vmware','proxmox'));--> statement-breakpoint
ALTER TABLE "provider_scopes" ADD CONSTRAINT "mode_valid" CHECK ("provider_scopes"."simulation_mode" in ('ok','partial','failed'));--> statement-breakpoint
ALTER TABLE "simulated_source_vms" ADD CONSTRAINT "source_external_id_nonempty" CHECK (length("simulated_source_vms"."external_id")>0);