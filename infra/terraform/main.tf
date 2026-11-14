# Networking: the account's default VPC keeps this simple (no NAT gateway costs).
# Both servers get public IPs; security groups restrict who can reach what.

data "aws_vpc" "default" {
  default = true
}

data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
  filter {
    name   = "default-for-az"
    values = ["true"]
  }
}

# Latest Amazon Linux 2023 (SSM agent pre-installed, so no SSH keys are needed).
data "aws_ssm_parameter" "al2023" {
  name = "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64"
}

data "aws_caller_identity" "current" {}

locals {
  subnet_id = sort(data.aws_subnets.default.ids)[0]
  ami_id    = data.aws_ssm_parameter.al2023.value
  log_group = "/${var.project}/app"
}

resource "aws_security_group" "jenkins" {
  name        = "${var.project}-jenkins"
  description = "Jenkins UI from the admin IP (and GitHub webhooks if configured)"
  vpc_id      = data.aws_vpc.default.id

  ingress {
    description = "Jenkins UI"
    from_port   = 8080
    to_port     = 8080
    protocol    = "tcp"
    cidr_blocks = concat([var.admin_cidr], var.github_webhook_cidrs)
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group" "app" {
  name        = "${var.project}-app"
  description = "Public HTTP to the ERP app. Postgres is never exposed."
  vpc_id      = data.aws_vpc.default.id

  ingress {
    description = "ERP web app"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}
