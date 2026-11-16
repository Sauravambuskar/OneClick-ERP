# OneClick ERP

A small ERP (products and stock, customers, sales orders) on **PostgreSQL**, with a **one-click CI/CD pipeline** that runs on either **AWS** or **GCP** — both are fully defined in this repo and neither depends on the other.

```
GitHub ─► Code Quality Gate ─► Build & Push ─► Registry ─► Container Gate ─► AI Report ─► Approval ─► App VM ─► Cloud Logs
          lint · types · unit tests            (scan on push)                (Claude)     (named
          integration tests · migrations                                                   approver)
          SAST · SCA
```

| | AWS | GCP |
|---|---|---|
| Pipeline | `Jenkinsfile` | `Jenkinsfile.gcp` |
| Infrastructure | `infra/terraform/` | `infra/terraform-gcp/` |
| Compute | EC2 | Compute Engine |
| Registry | Amazon ECR | Artifact Registry |
| Image scanning | ECR scan on push | Artifact Analysis |
| AI report | Claude on Amazon Bedrock | Claude on Vertex AI |
| Logs | CloudWatch | Cloud Logging |
| Notifications | SNS | SMTP (Jenkins mailer) |

## Quick start

| Goal | Command |
|---|---|
| Run locally | `docker compose up --build` → http://localhost:8080 |
| Quality gate locally | `cd app && npm ci && npm run lint && npm run typecheck && npm test && npm run migrations:check && npm run sast && npm run sca` |
| Integration tests locally | start a Postgres, then `INTEGRATION_DATABASE_URL=postgres://... npm run test:integration` |
| Create the AWS infrastructure | fill in `infra/terraform/terraform.tfvars`, then `./scripts/provision.ps1` |
| Create the GCP infrastructure | fill in `infra/terraform-gcp/terraform.tfvars`, then `terraform init && terraform apply` |
| **Release (the one click)** | Jenkins → `oneclick-erp` → **Build Now** |
| Tear down | `./scripts/provision.ps1 destroy` (AWS) · `terraform destroy` (GCP) |

## What the pipeline enforces

- **Quality gate** — lint, type check, unit tests, **integration tests against a real PostgreSQL**, migration-safety check, SAST, dependency audit.
- **Container gate** — the image is scanned after push and a CRITICAL or HIGH finding blocks the release.
- **AI-assisted report** — Claude reads every report the pipeline produced and writes a short release summary for the approver, who then sees one page instead of eight logs. If the model is unavailable the pipeline falls back to a rule-based summary and never blocks.
- **Named human approval** — only the configured approver can release to production.
- **Deploy and verify** — the new image is deployed over an IAP tunnel (GCP) or SSH (AWS), health-checked, and **rolled back automatically** if it does not come up.

## Production hardening (GCP)

- **HTTPS** — set `app_domain` in `terraform.tfvars` and Caddy obtains and renews a Let's Encrypt certificate automatically, serves HTTPS on 443 and redirects HTTP to it. Point the domain's A record at `terraform output app_ip` first. The pipeline's smoke test verifies both the certificate and the redirect.
- **Database backups** — a daily `pg_dump` is uploaded to a versioned Cloud Storage bucket and expires after `backup_retention_days`. Restore with `sudo /opt/erp/db-restore.sh` on the app VM (run it with no arguments to list what is available).
- **No public SSH** — port 22 is reachable only from Google's IAP range; Jenkins deploys through the tunnel.
- **Least privilege** — separate service accounts for Jenkins and the app, scoped to the single repository and the single secret each one needs.

### Known limitations

Honest list of what this does *not* do yet: a single Jenkins VM (no HA), a single zone (no multi-region failover), PostgreSQL in a container rather than a managed service, and no horizontal auto-scaling.

📘 **Full what / why / how:** [docs/DEPLOYMENT_GUIDE.md](docs/DEPLOYMENT_GUIDE.md)
