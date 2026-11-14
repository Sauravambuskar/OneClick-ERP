# Secrets are generated here and stored encrypted in SSM Parameter Store.
# The servers read them at boot with their IAM role; nothing secret lives in Git.

resource "random_password" "jenkins_admin" {
  length  = 20
  special = false
}

resource "random_password" "jenkins_approver" {
  length  = 20
  special = false
}

resource "random_password" "db" {
  length  = 24
  special = false # keeps the Postgres connection URL simple
}

resource "aws_ssm_parameter" "jenkins_admin_password" {
  name  = "/${var.project}/jenkins/admin-password"
  type  = "SecureString"
  value = random_password.jenkins_admin.result
}

resource "aws_ssm_parameter" "jenkins_approver_password" {
  name  = "/${var.project}/jenkins/approver-password"
  type  = "SecureString"
  value = random_password.jenkins_approver.result
}

resource "aws_ssm_parameter" "github_token" {
  name  = "/${var.project}/jenkins/github-token"
  type  = "SecureString"
  value = var.github_token == "" ? "none" : var.github_token
}

resource "aws_ssm_parameter" "db_password" {
  name  = "/${var.project}/app/db-password"
  type  = "SecureString"
  value = random_password.db.result
}
