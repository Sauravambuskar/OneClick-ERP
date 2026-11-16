resource "random_password" "db" {
  length  = 24
  special = false
}

resource "random_password" "admin" {
  length  = 20
  special = false
}

resource "random_password" "approver" {
  length  = 16
  special = false
}

resource "tls_private_key" "deploy" {
  algorithm = "RSA"
  rsa_bits  = 4096
}

resource "google_secret_manager_secret" "db_password" {
  secret_id = "${var.project_name}-db-password"
  replication {
    auto {}
  }
}
resource "google_secret_manager_secret_version" "db_password" {
  secret      = google_secret_manager_secret.db_password.id
  secret_data = random_password.db.result
}

resource "google_secret_manager_secret" "jenkins_admin_pw" {
  secret_id = "${var.project_name}-jenkins-admin-pw"
  replication {
    auto {}
  }
}
resource "google_secret_manager_secret_version" "jenkins_admin_pw" {
  secret      = google_secret_manager_secret.jenkins_admin_pw.id
  secret_data = random_password.admin.result
}

resource "google_secret_manager_secret" "jenkins_approver_pw" {
  secret_id = "${var.project_name}-jenkins-approver-pw"
  replication {
    auto {}
  }
}
resource "google_secret_manager_secret_version" "jenkins_approver_pw" {
  secret      = google_secret_manager_secret.jenkins_approver_pw.id
  secret_data = random_password.approver.result
}

resource "google_secret_manager_secret" "github_token" {
  secret_id = "${var.project_name}-github-token"
  replication {
    auto {}
  }
}
resource "google_secret_manager_secret_version" "github_token" {
  secret      = google_secret_manager_secret.github_token.id
  secret_data = coalesce(var.github_token, "none")
}

resource "google_secret_manager_secret" "smtp_password" {
  secret_id = "${var.project_name}-smtp-password"
  replication {
    auto {}
  }
}
resource "google_secret_manager_secret_version" "smtp_password" {
  secret      = google_secret_manager_secret.smtp_password.id
  secret_data = coalesce(var.smtp_password, "none")
}

resource "google_secret_manager_secret" "deploy_ssh_key" {
  secret_id = "${var.project_name}-deploy-ssh-key"
  replication {
    auto {}
  }
}
resource "google_secret_manager_secret_version" "deploy_ssh_key" {
  secret      = google_secret_manager_secret.deploy_ssh_key.id
  secret_data = tls_private_key.deploy.private_key_pem
}
