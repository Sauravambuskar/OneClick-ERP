resource "google_artifact_registry_repository" "erp" {
  location      = var.region
  repository_id = var.project_name
  description   = "Docker images for OneClick ERP"
  format        = "DOCKER"

  # Immutable tags: once an image is pushed with a tag, it can never be overwritten.
  # Same guarantee as ECR immutable tags on the AWS side.
  docker_config {
    immutable_tags = true
  }

  # Artifact Analysis (Container Scanning) is enabled project-wide via the
  # containerscanning.googleapis.com API — no per-repo setting needed.

  # Keep the last 10 tagged images; delete older ones automatically.
  cleanup_policies {
    id     = "keep-last-10"
    action = "KEEP"
    most_recent_versions {
      keep_count = 10
    }
  }
}
