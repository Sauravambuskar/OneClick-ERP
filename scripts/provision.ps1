# Windows version of provision.sh.
#   .\scripts\provision.ps1            # create / update
#   .\scripts\provision.ps1 destroy    # tear everything down
param([string]$Action = "apply")
$ErrorActionPreference = "Stop"

Set-Location (Join-Path $PSScriptRoot "..\infra\terraform")

foreach ($tool in "terraform", "aws") {
  if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) { throw "Missing '$tool'. See docs/DEPLOYMENT_GUIDE.md, step 1." }
}
aws sts get-caller-identity --query Arn --output text | Out-Null
if ($LASTEXITCODE -ne 0) { throw "AWS CLI is not logged in (run: aws configure)." }
if (-not (Test-Path terraform.tfvars)) { throw "Create infra/terraform/terraform.tfvars from terraform.tfvars.example first." }

terraform init -input=false
if ($LASTEXITCODE -ne 0) { throw "terraform init failed" }

if ($Action -eq "destroy") { terraform destroy; exit $LASTEXITCODE }

terraform apply -input=false
if ($LASTEXITCODE -ne 0) { throw "terraform apply failed" }

$jenkinsUrl = terraform output -raw jenkins_url
Write-Host "`nWaiting for Jenkins to finish its first boot (usually 5-8 minutes)..."
for ($i = 0; $i -lt 90; $i++) {
  try { if ((Invoke-WebRequest "$($jenkinsUrl)login" -UseBasicParsing -TimeoutSec 5).StatusCode -eq 200) { break } } catch {}
  Start-Sleep -Seconds 10
}

Write-Host @"

=====================================================================
 OneClick ERP infrastructure is ready
=====================================================================
 Jenkins     : $jenkinsUrl
   admin     : admin    / $(terraform output -raw jenkins_admin_password)
   approver  : approver / $(terraform output -raw jenkins_approver_password)
 App URL     : $(terraform output -raw app_url)   (live after the first pipeline run)
 Webhook URL : $(terraform output -raw github_webhook_url)
 Logs        : $(terraform output -raw cloudwatch_logs_url)

 NEXT: confirm the SNS email AWS just sent you, then open Jenkins ->
       'oneclick-erp' -> 'Build Now'. That is the one click.
=====================================================================
"@
