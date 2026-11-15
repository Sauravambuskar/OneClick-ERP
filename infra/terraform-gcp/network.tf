resource "google_compute_network" "erp" {
  name                    = "${var.project_name}-vpc"
  auto_create_subnetworks = true
}

# App VM: allow HTTP from the public internet
resource "google_compute_firewall" "app_http" {
  name    = "${var.project_name}-app-http"
  network = google_compute_network.erp.name

  allow {
    protocol = "tcp"
    ports    = ["80"]
  }

  source_ranges = ["0.0.0.0/0"]
  target_tags   = ["erp-app"]
}

# Jenkins UI (8080): only from admin IP + GitHub webhook ranges
resource "google_compute_firewall" "jenkins_ui" {
  name    = "${var.project_name}-jenkins-ui"
  network = google_compute_network.erp.name

  allow {
    protocol = "tcp"
    ports    = ["8080"]
  }

  source_ranges = concat([var.admin_cidr], var.github_webhook_cidrs)
  target_tags   = ["erp-jenkins"]
}

# SSH port 22: only from Google's IAP tunneling range.
# No public SSH at all — Jenkins deploys via IAP, admins access via IAP too.
resource "google_compute_firewall" "iap_ssh" {
  name    = "${var.project_name}-iap-ssh"
  network = google_compute_network.erp.name

  allow {
    protocol = "tcp"
    ports    = ["22"]
  }

  source_ranges = ["35.235.240.0/20"]
  target_tags   = ["erp-jenkins", "erp-app"]
}
