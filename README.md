# OneClick ERP

A small ERP (products and stock, customers, sales orders) on **PostgreSQL**. It ships with a **one-click CI/CD pipeline**: **GitHub → Jenkins on EC2 → Amazon ECR → container security gate → AI-assisted report (Claude on Amazon Bedrock) → manual approval → EC2 → CloudWatch**.

```
GitHub ─► Code Quality Gate ─► Build & Push ─► Amazon ECR ─► Container Gate ─► AI Report ─► Approval ─► EC2 ─► CloudWatch
          lint · types · tests                    (scan on push)                  (Bedrock)    (named
          migration safety · SAST · SCA                                                          approver)
```

## Quick start

| Goal | Command |
|---|---|
| Run locally | `docker compose up --build` → http://localhost:8080 |
| Run the quality gate locally | `cd app && npm ci && npm run lint && npm run typecheck && npm test && npm run migrations:check && npm run sast && npm run sca` |
| Create the AWS infrastructure (once) | fill in `infra/terraform/terraform.tfvars`, then `./scripts/provision.ps1` |
| **Release (the one click)** | Jenkins → `oneclick-erp` → **Build Now** |
| Tear down | `./scripts/provision.ps1 destroy` |

📘 **Full what / why / how:** [docs/DEPLOYMENT_GUIDE.md](docs/DEPLOYMENT_GUIDE.md)
