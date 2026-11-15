locals {
  gar_host   = "${var.region}-docker.pkg.dev"
  image_repo = "${var.region}-docker.pkg.dev/${var.project_id}/${var.project_name}"
}

# ── Static IPs ─────────────────────────────────────────────────────────────────

resource "google_compute_address" "jenkins" {
  name   = "${var.project_name}-jenkins-ip"
  region = var.region
}

resource "google_compute_address" "app" {
  name   = "${var.project_name}-app-ip"
  region = var.region
}

# ── Jenkins VM ─────────────────────────────────────────────────────────────────

resource "google_compute_instance" "jenkins" {
  name         = "${var.project_name}-jenkins"
  machine_type = var.jenkins_machine_type
  zone         = var.zone
  tags         = ["erp-jenkins"]

  boot_disk {
    initialize_params {
      image = "debian-cloud/debian-12"
      size  = 30
    }
  }

  network_interface {
    network = google_compute_network.erp.name
    access_config {
      nat_ip = google_compute_address.jenkins.address
    }
  }

  service_account {
    email  = google_service_account.jenkins.email
    scopes = ["cloud-platform"]
  }

  shielded_instance_config {
    enable_secure_boot          = true
    enable_vtpm                 = true
    enable_integrity_monitoring = true
  }

  metadata = {
    enable-oslogin = "TRUE"
  }

  metadata_startup_script = templatefile("${path.module}/templates/jenkins-startup.sh.tftpl", {
    dockerfile_b64       = base64encode(file("${path.module}/../../jenkins/Dockerfile.gcp"))
    plugins_b64          = base64encode(file("${path.module}/../../jenkins/plugins-gcp.txt"))
    casc_b64             = base64encode(file("${path.module}/../../jenkins/jenkins-gcp.yaml"))
    project_id           = var.project_id
    project_name         = var.project_name
    admin_pw_secret      = google_secret_manager_secret.jenkins_admin_pw.secret_id
    approver_pw_secret   = google_secret_manager_secret.jenkins_approver_pw.secret_id
    github_token_secret  = google_secret_manager_secret.github_token.secret_id
    smtp_password_secret = google_secret_manager_secret.smtp_password.secret_id
    github_repo_url      = var.github_repo_url
    github_branch        = var.github_branch
    jenkins_url          = "http://${google_compute_address.jenkins.address}:8080"
    gar_region           = var.region
    image_repo           = local.image_repo
    app_vm               = "${var.project_name}-app"
    zone                 = var.zone
    app_url              = "http://${google_compute_address.app.address}"
    vertex_model_id      = var.vertex_model_id
    vertex_region        = var.vertex_region
    notification_email   = var.notification_email
    smtp_host            = var.smtp_host
    smtp_port            = tostring(var.smtp_port)
    smtp_user            = var.smtp_user
    release_approvers    = var.release_approvers
    fail_on_severity     = var.fail_on_severity
  })
}

# ── App VM ─────────────────────────────────────────────────────────────────────

resource "google_compute_instance" "app" {
  name         = "${var.project_name}-app"
  machine_type = var.app_machine_type
  zone         = var.zone
  tags         = ["erp-app"]

  boot_disk {
    initialize_params {
      image = "debian-cloud/debian-12"
      size  = 20
    }
  }

  network_interface {
    network = google_compute_network.erp.name
    access_config {
      nat_ip = google_compute_address.app.address
    }
  }

  service_account {
    email  = google_service_account.app.email
    scopes = ["cloud-platform"]
  }

  shielded_instance_config {
    enable_secure_boot          = true
    enable_vtpm                 = true
    enable_integrity_monitoring = true
  }

  # OS Login disabled so the metadata ssh-keys entry is honoured.
  # Port 22 is only reachable from IAP (see network.tf).
  metadata = {
    "ssh-keys" = "deployer:${tls_private_key.deploy.public_key_openssh}"
  }

  metadata_startup_script = templatefile("${path.module}/templates/app-startup.sh.tftpl", {
    compose_b64  = base64encode(file("${path.module}/files/docker-compose.prod.yml"))
    deploy_b64   = base64encode(file("${path.module}/files/deploy.sh"))
    project_id   = var.project_id
    project_name = var.project_name
    db_secret    = google_secret_manager_secret.db_password.secret_id
    gar_region   = var.region
    log_name     = "${var.project_name}-app"
  })
}
