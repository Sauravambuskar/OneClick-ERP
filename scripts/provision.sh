#!/usr/bin/env bash
# One-time setup: creates ALL AWS infrastructure and a fully configured Jenkins.
# After this, every release is one click on "Build Now" (or a git push).
#
#   ./scripts/provision.sh            # create / update
#   ./scripts/provision.sh destroy    # tear everything down
set -euo pipefail

cd "$(dirname "$0")/../infra/terraform"

for tool in terraform aws; do
  command -v "$tool" >/dev/null || { echo "Missing '$tool'. See docs/DEPLOYMENT_GUIDE.md, step 1."; exit 1; }
done
aws sts get-caller-identity --query Arn --output text >/dev/null || { echo "AWS CLI is not logged in (run: aws configure)."; exit 1; }
[ -f terraform.tfvars ] || { echo "Create infra/terraform/terraform.tfvars from terraform.tfvars.example first."; exit 1; }

terraform init -input=false

if [ "${1:-}" = "destroy" ]; then
  terraform destroy
  exit 0
fi

terraform apply -input=false

JENKINS_URL=$(terraform output -raw jenkins_url)
echo
echo "Waiting for Jenkins to finish its first boot (usually 5-8 minutes)..."
for _ in $(seq 1 90); do
  code=$(curl -s -o /dev/null -w '%{http_code}' "${JENKINS_URL}login" || true)
  [ "$code" = "200" ] && break
  sleep 10
done

cat <<EOF

=====================================================================
 OneClick ERP infrastructure is ready
=====================================================================
 Jenkins     : $JENKINS_URL
   admin     : admin    / $(terraform output -raw jenkins_admin_password)
   approver  : approver / $(terraform output -raw jenkins_approver_password)
 App URL     : $(terraform output -raw app_url)   (live after the first pipeline run)
 Webhook URL : $(terraform output -raw github_webhook_url)
 Logs        : $(terraform output -raw cloudwatch_logs_url)

 NEXT: confirm the SNS email AWS just sent you, then open Jenkins ->
       'oneclick-erp' -> 'Build Now'. That is the one click.
=====================================================================
EOF
