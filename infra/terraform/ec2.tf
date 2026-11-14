# Elastic IPs give both servers stable addresses (URLs survive stop/start).
resource "aws_eip" "jenkins" {
  domain = "vpc"
  tags   = { Name = "${var.project}-jenkins" }
}

resource "aws_eip" "app" {
  domain = "vpc"
  tags   = { Name = "${var.project}-app" }
}

# ============================== App server ==============================
# Runs two containers with Docker Compose: the ERP app and PostgreSQL.
resource "aws_instance" "app" {
  ami                    = local.ami_id
  instance_type          = var.app_instance_type
  subnet_id              = local.subnet_id
  vpc_security_group_ids = [aws_security_group.app.id]
  iam_instance_profile   = aws_iam_instance_profile.app.name

  metadata_options {
    http_tokens = "required" # IMDSv2 only
  }

  root_block_device {
    volume_size = 20
    volume_type = "gp3"
    encrypted   = true
  }

  user_data_replace_on_change = true
  user_data = templatefile("${path.module}/templates/app-user-data.sh.tftpl", {
    aws_region    = var.aws_region
    log_group     = local.log_group
    db_param_name = aws_ssm_parameter.db_password.name
    compose_b64   = filebase64("${path.module}/files/docker-compose.prod.yml")
    deploy_b64    = filebase64("${path.module}/files/deploy.sh")
  })

  tags = { Name = "${var.project}-app" }

  depends_on = [aws_iam_role_policy.app]
}

resource "aws_eip_association" "app" {
  instance_id   = aws_instance.app.id
  allocation_id = aws_eip.app.id
}

# ============================== Jenkins server ==============================
# Builds a pre-configured Jenkins image on first boot and starts it.
resource "aws_instance" "jenkins" {
  ami                    = local.ami_id
  instance_type          = var.jenkins_instance_type
  subnet_id              = local.subnet_id
  vpc_security_group_ids = [aws_security_group.jenkins.id]
  iam_instance_profile   = aws_iam_instance_profile.jenkins.name

  metadata_options {
    http_tokens                 = "required"
    http_put_response_hop_limit = 2 # lets the Jenkins *container* use the instance role
  }

  root_block_device {
    volume_size = 30
    volume_type = "gp3"
    encrypted   = true
  }

  user_data_replace_on_change = true
  user_data = templatefile("${path.module}/templates/jenkins-user-data.sh.tftpl", {
    project            = var.project
    aws_region         = var.aws_region
    github_repo_url    = var.github_repo_url
    github_branch      = var.github_branch
    ecr_repo_url       = aws_ecr_repository.app.repository_url
    app_instance_id    = aws_instance.app.id
    app_url            = "http://${aws_eip.app.public_ip}"
    jenkins_url        = "http://${aws_eip.jenkins.public_ip}:8080/"
    log_group          = local.log_group
    sns_topic_arn      = aws_sns_topic.releases.arn
    bedrock_model_id   = var.bedrock_model_id
    release_approvers  = var.release_approvers
    fail_on_severity   = var.fail_on_severity
    admin_pw_param     = aws_ssm_parameter.jenkins_admin_password.name
    approver_pw_param  = aws_ssm_parameter.jenkins_approver_password.name
    github_token_param = aws_ssm_parameter.github_token.name
    dockerfile_b64     = filebase64("${path.module}/../../jenkins/Dockerfile")
    plugins_b64        = filebase64("${path.module}/../../jenkins/plugins.txt")
    casc_b64           = filebase64("${path.module}/../../jenkins/jenkins.yaml")
  })

  tags = { Name = "${var.project}-jenkins" }

  depends_on = [aws_iam_role_policy.jenkins]
}

resource "aws_eip_association" "jenkins" {
  instance_id   = aws_instance.jenkins.id
  allocation_id = aws_eip.jenkins.id
}
