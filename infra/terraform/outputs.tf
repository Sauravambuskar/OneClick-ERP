output "jenkins_url" {
  description = "Open this, log in, click 'oneclick-erp' -> 'Build Now'."
  value       = "http://${aws_eip.jenkins.public_ip}:8080/"
}

output "app_url" {
  description = "The ERP app (live after the first successful pipeline run)."
  value       = "http://${aws_eip.app.public_ip}"
}

output "github_webhook_url" {
  description = "Paste into GitHub -> Settings -> Webhooks (content type application/json) for deploy-on-push."
  value       = "http://${aws_eip.jenkins.public_ip}:8080/github-webhook/"
}

output "ecr_repository_url" {
  value = aws_ecr_repository.app.repository_url
}

output "cloudwatch_logs_url" {
  value = "https://${var.aws_region}.console.aws.amazon.com/cloudwatch/home?region=${var.aws_region}#logsV2:log-groups/log-group/${replace(local.log_group, "/", "$252F")}"
}

output "jenkins_admin_password" {
  description = "terraform output -raw jenkins_admin_password"
  value       = random_password.jenkins_admin.result
  sensitive   = true
}

output "jenkins_approver_password" {
  description = "terraform output -raw jenkins_approver_password"
  value       = random_password.jenkins_approver.result
  sensitive   = true
}

output "app_instance_id" {
  value = aws_instance.app.id
}

output "jenkins_instance_id" {
  value = aws_instance.jenkins.id
}
