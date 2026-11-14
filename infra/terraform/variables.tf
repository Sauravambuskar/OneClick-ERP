variable "project" {
  description = "Name prefix for every AWS resource."
  type        = string
  default     = "oneclick-erp"
}

variable "aws_region" {
  description = "AWS region to deploy into. Pick one where Claude is available on Amazon Bedrock if you want AI reports."
  type        = string
  default     = "us-east-1"
}

variable "github_repo_url" {
  description = "HTTPS clone URL of your GitHub repository, e.g. https://github.com/your-user/oneclick-erp.git"
  type        = string
}

variable "github_branch" {
  description = "Branch that Jenkins builds and deploys."
  type        = string
  default     = "main"
}

variable "github_token" {
  description = "GitHub personal access token (read-only, 'Contents: Read'). Leave empty for a public repository."
  type        = string
  default     = ""
  sensitive   = true
}

variable "admin_cidr" {
  description = "Your public IP in CIDR form (e.g. 203.0.113.10/32). Only this range can open the Jenkins UI."
  type        = string
}

variable "github_webhook_cidrs" {
  description = "GitHub webhook source ranges, so a push can trigger Jenkins. Empty list = no auto-trigger (use Build Now). Current list: https://api.github.com/meta (hooks)."
  type        = list(string)
  default     = []
}

variable "notification_email" {
  description = "Email that receives the AI release report, approval requests and deploy results (confirm the SNS email after apply)."
  type        = string
}

variable "release_approvers" {
  description = "Comma-separated Jenkins user IDs allowed to approve a production deploy."
  type        = string
  default     = "approver"
}

variable "fail_on_severity" {
  description = "Container scan severities that block a release."
  type        = string
  default     = "CRITICAL,HIGH"
}

variable "bedrock_model_id" {
  description = "Claude model used for the AI-assisted release report (Amazon Bedrock model ID)."
  type        = string
  default     = "anthropic.claude-opus-5-5"
}

variable "jenkins_instance_type" {
  type    = string
  default = "t3.small"
}

variable "app_instance_type" {
  type    = string
  default = "t3.small"
}

variable "log_retention_days" {
  type    = number
  default = 30
}
