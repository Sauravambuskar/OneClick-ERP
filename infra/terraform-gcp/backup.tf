# Daily database dumps from the App VM land here.
# Versioning + a lifecycle rule mean a bad backup can never erase good history:
# nothing deletes objects except the age rule below.

resource "google_storage_bucket" "db_backups" {
  name                        = "${var.project_id}-db-backups"
  location                    = var.region
  uniform_bucket_level_access = true
  force_destroy               = false

  versioning {
    enabled = true
  }

  lifecycle_rule {
    condition {
      age = var.backup_retention_days
    }
    action {
      type = "Delete"
    }
  }

  # Keep one non-current version around briefly in case a dump is overwritten.
  lifecycle_rule {
    condition {
      days_since_noncurrent_time = 7
    }
    action {
      type = "Delete"
    }
  }
}

# The App VM writes backups. objectUser covers create + read (needed to restore)
# but not bucket-level deletes, so the VM cannot wipe the backup history.
resource "google_storage_bucket_iam_member" "app_backup_writer" {
  bucket = google_storage_bucket.db_backups.name
  role   = "roles/storage.objectUser"
  member = "serviceAccount:${google_service_account.app.email}"
}
