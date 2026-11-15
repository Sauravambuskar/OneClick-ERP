# ── Service accounts ──────────────────────────────────────────────────────────

resource "google_service_account" "jenkins" {
  account_id   = "${var.project_name}-jenkins"
  display_name = "OneClick ERP - Jenkins CI/CD"
}

resource "google_service_account" "app" {
  account_id   = "${var.project_name}-app"
  display_name = "OneClick ERP - App VM"
}

# ── Jenkins SA permissions ─────────────────────────────────────────────────────

# Push images to Artifact Registry (repo-scoped, not project-wide writer)
resource "google_artifact_registry_repository_iam_member" "jenkins_ar_writer" {
  location   = google_artifact_registry_repository.erp.location
  repository = google_artifact_registry_repository.erp.name
  role       = "roles/artifactregistry.writer"
  member     = "serviceAccount:${google_service_account.jenkins.email}"
}

# Use Vertex AI (Claude)
resource "google_project_iam_member" "jenkins_vertex" {
  project = var.project_id
  role    = "roles/aiplatform.user"
  member  = "serviceAccount:${google_service_account.jenkins.email}"
}

# Create IAP tunnels to reach the app VM without opening port 22 publicly
resource "google_project_iam_member" "jenkins_iap" {
  project = var.project_id
  role    = "roles/iap.tunnelResourceAccessor"
  member  = "serviceAccount:${google_service_account.jenkins.email}"
}

# List/describe compute instances (required by gcloud compute ssh via IAP)
resource "google_project_iam_member" "jenkins_compute_viewer" {
  project = var.project_id
  role    = "roles/compute.viewer"
  member  = "serviceAccount:${google_service_account.jenkins.email}"
}

# Read all secrets needed by Jenkins (admin PW, approver PW, github token, SMTP, deploy key)
resource "google_project_iam_member" "jenkins_secrets" {
  project = var.project_id
  role    = "roles/secretmanager.secretAccessor"
  member  = "serviceAccount:${google_service_account.jenkins.email}"
}

# ── App SA permissions ─────────────────────────────────────────────────────────

# Pull images from Artifact Registry
resource "google_artifact_registry_repository_iam_member" "app_ar_reader" {
  location   = google_artifact_registry_repository.erp.location
  repository = google_artifact_registry_repository.erp.name
  role       = "roles/artifactregistry.reader"
  member     = "serviceAccount:${google_service_account.app.email}"
}

# Write logs (used by Docker gcplogs driver)
resource "google_project_iam_member" "app_logging" {
  project = var.project_id
  role    = "roles/logging.logWriter"
  member  = "serviceAccount:${google_service_account.app.email}"
}

# App only needs the DB password — scope to that one secret
resource "google_secret_manager_secret_iam_member" "app_db_secret" {
  secret_id = google_secret_manager_secret.db_password.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.app.email}"
}
