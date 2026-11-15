output "jenkins_url" {
  description = "Jenkins UI — open this in your browser"
  value       = "http://${google_compute_address.jenkins.address}:8080"
}

output "app_url" {
  description = "Live application URL"
  value       = "http://${google_compute_address.app.address}"
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
