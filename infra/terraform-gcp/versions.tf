terraform {
  required_version = ">= 1.6"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
    tls = {
      source  = "hashicorp/tls"
      version = "~> 4.0"
    }
  }

  # GCS bucket for state — create this bucket first (see Step 3 in the guide),
  # then set the bucket name here and run terraform init.
  backend "gcs" {
    bucket = "oneclick-erp-prod24-tfstate" # <-- apna bucket naam yahan dalo
    prefix = "oneclick-erp/state"
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}
