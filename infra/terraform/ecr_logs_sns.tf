# ---------------- Amazon ECR: container registry + built-in vulnerability scan ----------------
resource "aws_ecr_repository" "app" {
  name                 = var.project
  image_tag_mutability = "IMMUTABLE" # a tag always means the same image: clean audit trail
  force_delete         = true        # lets `terraform destroy` clean up; remove for real production

  image_scanning_configuration {
    scan_on_push = true
  }
}

resource "aws_ecr_lifecycle_policy" "app" {
  repository = aws_ecr_repository.app.name
  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep the last 30 images"
      selection    = { tagStatus = "any", countType = "imageCountMoreThan", countNumber = 30 }
      action       = { type = "expire" }
    }]
  })
}

# ---------------- CloudWatch Logs: centralized app, database and deploy logs ----------------
resource "aws_cloudwatch_log_group" "app" {
  name              = local.log_group
  retention_in_days = var.log_retention_days
}

# ---------------- SNS: email notifications (AI report, approvals, results) ----------------
resource "aws_sns_topic" "releases" {
  name = "${var.project}-releases"
}

resource "aws_sns_topic_subscription" "email" {
  topic_arn = aws_sns_topic.releases.arn
  protocol  = "email"
  endpoint  = var.notification_email
}
