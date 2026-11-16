variable "project_id" {
  description = "GCP project ID, e.g. oneclick-erp-123456"
  type        = string
}

variable "region" {
  description = "GCP region for all resources"
  type        = string
  default     = "us-central1"
}

variable "zone" {
  description = "GCP zone for the VMs"
  type        = string
  default     = "us-central1-a"
}

variable "project_name" {
  description = "Name prefix used on every GCP resource"
  type        = string
  default     = "oneclick-erp"
}

variable "github_repo_url" {
  description = "HTTPS clone URL of your GitHub repo, e.g. https://github.com/user/oneclick-erp.git"
  type        = string
}

variable "github_branch" {
  description = "Branch that Jenkins builds and deploys"
  type        = string
  default     = "main"
}

variable "github_token" {
  description = "GitHub personal access token (read-only, Contents: Read). Empty for public repos."
  type        = string
  default     = ""
  sensitive   = true
}

variable "admin_cidr" {
  description = "Your public IP in CIDR form (e.g. 203.0.113.10/32). Only this range can open the Jenkins UI."
  type        = string
}

variable "github_webhook_cidrs" {
  description = "GitHub webhook source ranges so a push triggers Jenkins. See https://api.github.com/meta (hooks)."
  type        = list(string)
  default     = []
}

variable "notification_email" {
  description = "Email address for release reports, approval requests, and deploy results."
  type        = string
}

variable "smtp_host" {
  description = "SMTP server hostname for Jenkins email. GCP blocks port 25 — use port 587."
  type        = string
  default     = "smtp.gmail.com"
}

variable "smtp_port" {
  description = "SMTP port (use 587 on GCP; port 25 is blocked by GCP firewall)"
  type        = number
  default     = 587
}

variable "smtp_user" {
  description = "SMTP login username / sender email"
  type        = string
  default     = ""
}

variable "smtp_password" {
  description = "SMTP password or Gmail app password"
  type        = string
  default     = ""
  sensitive   = true
}

variable "release_approvers" {
  description = "Comma-separated Jenkins user IDs allowed to approve a production deploy"
  type        = string
  default     = "approver"
}

variable "fail_on_severity" {
  description = "Container scan severities that block a release"
  type        = string
  default     = "CRITICAL,HIGH"
}

variable "vertex_model_id" {
  description = "Claude model ID in Vertex AI Model Garden, e.g. claude-opus-4-5"
  type        = string
  default     = "claude-opus-4-5"
}

variable "vertex_region" {
  description = "Vertex AI region. Claude is available in us-east5 and europe-west1."
  type        = string
  default     = "us-east5"
}

variable "jenkins_machine_type" {
  description = "Jenkins VM machine type"
  type        = string
  default     = "e2-medium"
}

variable "app_machine_type" {
  description = "App VM machine type"
  type        = string
  default     = "e2-small"
}

variable "log_retention_days" {
  description = "Cloud Logging log bucket retention in days"
  type        = number
  default     = 30
}

variable "app_domain" {
  description = <<-EOT
    Domain name for the app, e.g. erp.example.com. When set, Caddy obtains a
    Let's Encrypt certificate automatically and serves HTTPS. Point the domain's
    A record at the app's static IP BEFORE running apply, or the first
    certificate request will fail. Leave empty to serve plain HTTP on the IP.
  EOT
  type        = string
  default     = ""

  validation {
    condition     = var.app_domain == "" || can(regex("^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$", var.app_domain))
    error_message = "app_domain must be a bare hostname such as erp.example.com — no scheme, port or trailing slash."
  }
}

variable "acme_email" {
  description = "Contact address Let's Encrypt uses for certificate expiry warnings. Defaults to notification_email."
  type        = string
  default     = ""
}

variable "backup_retention_days" {
  description = "How many days of daily database backups to keep in Cloud Storage"
  type        = number
  default     = 30
}
