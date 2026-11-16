output "jenkins_url" {
  description = "Jenkins UI — open this in your browser"
  value       = "http://${google_compute_address.jenkins.address}:8080"
}

output "app_url" {
  description = "Live application URL (HTTPS when app_domain is set)"
  value       = local.app_url
}

output "app_ip" {
  description = "App VM public IP — point your domain's A record here"
  value       = google_compute_address.app.address
}

output "dns_setup" {
  description = "What to do before HTTPS can work"
  value       = var.app_domain != "" ? "Create an A record: ${var.app_domain} -> ${google_compute_address.app.address}. Caddy requests the certificate on the first HTTPS request." : "No app_domain set — serving plain HTTP. Set app_domain in terraform.tfvars to enable HTTPS."
}

output "backup_bucket" {
  description = "Cloud Storage bucket holding the daily database backups"
  value       = google_storage_bucket.db_backups.name
}

output "restore_command" {
  description = "List and restore database backups from the App VM"
  value       = "gcloud compute ssh ${google_compute_instance.app.name} --zone=${var.zone} --tunnel-through-iap --project=${var.project_id} --command='sudo /opt/erp/db-restore.sh'"
}

output "image_repo" {
  description = "Artifact Registry image path (use in IMAGE_URI)"
  value       = local.image_repo
}

output "jenkins_vm_name" {
  description = "Jenkins VM name (for gcloud compute ssh)"
  value       = google_compute_instance.jenkins.name
}

output "app_vm_name" {
  description = "App VM name (used by pipeline for IAP deploy)"
  value       = google_compute_instance.app.name
}

output "logs_explorer_url" {
  description = "Cloud Logging Logs Explorer filtered to this project"
  value       = "https://console.cloud.google.com/logs/query?project=${var.project_id}"
}

output "jenkins_admin_password_command" {
  description = "Command to retrieve the Jenkins admin password"
  value       = "gcloud secrets versions access latest --secret=${google_secret_manager_secret.jenkins_admin_pw.secret_id} --project=${var.project_id}"
}
