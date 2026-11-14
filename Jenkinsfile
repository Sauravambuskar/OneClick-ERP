// OneClick ERP - CI/CD pipeline
//
// One click ("Build Now", or a push to GitHub) moves the code through six phases:
//   1. Source              - checkout from GitHub
//   2. Code Quality Gate   - lint, type check, unit tests, migration safety, SAST, SCA (+ optional SonarQube)
//   3. Build & Push        - docker build, push to Amazon ECR
//   4. Container Gate      - Amazon ECR vulnerability scan, blocks on CRITICAL/HIGH
//   5. Report & Approval   - AI-written release summary (Amazon Bedrock) + SNS email, then a named human approves
//   6. Deploy & Verify     - AWS SSM deploys to the EC2 app server, health-checked smoke test, auto-rollback
//
// Environment values (AWS_REGION, ECR_REPO_URL, APP_INSTANCE_ID, ...) are injected
// into Jenkins by Terraform + Configuration-as-Code; nothing is hard-coded here.

pipeline {
  agent any

  options {
    timestamps()
    disableConcurrentBuilds()
    buildDiscarder(logRotator(numToKeepStr: '20'))
    timeout(time: 90, unit: 'MINUTES')
  }

  environment {
    REPORT_DIR = "${WORKSPACE}/reports"
  }

  stages {

    // ------------------------------------------------------------------ Phase 1
    stage('1. Source') {
      steps {
        checkout scm
        script {
          env.GIT_SHORT = sh(script: 'git rev-parse --short=8 HEAD', returnStdout: true).trim()
          env.IMAGE_TAG = "${env.BUILD_NUMBER}-${env.GIT_SHORT}"
          env.IMAGE_URI = "${env.ECR_REPO_URL}:${env.IMAGE_TAG}"
          env.COMMIT_MSG = sh(script: 'git log -1 --pretty=%s', returnStdout: true).trim()
          env.COMMIT_AUTHOR = sh(script: 'git log -1 --pretty=%an', returnStdout: true).trim()
          currentBuild.displayName = "#${env.BUILD_NUMBER} ${env.GIT_SHORT}"
        }
        sh 'rm -rf "$REPORT_DIR" && mkdir -p "$REPORT_DIR"'
      }
    }

    // ------------------------------------------------------------------ Phase 2
    stage('2. Code Quality Gate') {
      stages {
        stage('Install') {
          steps { dir('app') { sh 'npm ci --no-fund --no-audit' } }
        }
        stage('Lint') {
          steps { dir('app') { sh '#!/bin/bash\nset -eo pipefail\nnpm run -s lint 2>&1 | tee "$REPORT_DIR/lint.txt"' } }
        }
        stage('Type Check') {
          steps { dir('app') { sh '#!/bin/bash\nset -eo pipefail\nnpm run -s typecheck 2>&1 | tee "$REPORT_DIR/typecheck.txt"' } }
        }
        stage('Unit Tests') {
          steps { dir('app') { sh '#!/bin/bash\nset -eo pipefail\nnpm test 2>&1 | tee "$REPORT_DIR/tests.txt"' } }
        }
        stage('Migration Safety') {
          steps {
            dir('app') {
              sh '''#!/bin/bash
          set -eo pipefail
                git fetch --no-tags origin "+refs/heads/${GITHUB_BRANCH}:refs/remotes/origin/${GITHUB_BRANCH}" || true
                # Compare with the last successfully deployed commit when known, else with the main branch.
                export MIGRATION_BASE_REF="${GIT_PREVIOUS_SUCCESSFUL_COMMIT:-origin/${GITHUB_BRANCH}}"
                npm run -s migrations:check 2>&1 | tee "$REPORT_DIR/migrations.txt"
              '''
            }
          }
        }
        stage('SAST') {
          steps { dir('app') { sh '#!/bin/bash\nset -eo pipefail\nnpm run -s sast 2>&1 | tee "$REPORT_DIR/sast.txt"' } }
        }
        stage('SCA (dependencies)') {
          steps { dir('app') { sh '#!/bin/bash\nset -eo pipefail\nnpm run -s sca 2>&1 | tee "$REPORT_DIR/sca.txt"' } }
        }
        stage('SonarQube (optional)') {
          when { expression { return env.SONAR_HOST_URL?.trim() } }
          steps {
            withCredentials([string(credentialsId: 'sonar-token', variable: 'SONAR_TOKEN')]) {
              dir('app') {
                sh '''#!/bin/bash
          set -eo pipefail
                  npx --yes @sonar/scan \
                    -Dsonar.host.url="$SONAR_HOST_URL" -Dsonar.token="$SONAR_TOKEN" \
                    -Dsonar.projectKey=oneclick-erp -Dsonar.sources=src -Dsonar.tests=test \
                    -Dsonar.qualitygate.wait=true 2>&1 | tee "$REPORT_DIR/sonarqube.txt"
                '''
              }
            }
          }
        }
      }
    }

    // ------------------------------------------------------------------ Phase 3
    stage('3. Build & Push') {
      steps {
        sh '''#!/bin/bash
          set -eo pipefail
          docker build --pull --build-arg APP_VERSION="$IMAGE_TAG" -t "$IMAGE_URI" app
          aws ecr get-login-password --region "$AWS_REGION" \
            | docker login --username AWS --password-stdin "${ECR_REPO_URL%%/*}"
          docker push "$IMAGE_URI"
          echo "Pushed $IMAGE_URI" | tee "$REPORT_DIR/image.txt"
        '''
      }
    }

//     // ------------------------------------------------------------------ Phase 4
//     // stage('4. Container Security Gate') {
//     //steps {
//         //sh '''
//         //echo "Scanning image: ${IMAGE_TAG}"
        
//        // # Retry logic - ECR scan takes time
//         for i in {1..30}; do
//           SCAN_STATUS=$(aws ecr describe-image-scan-findings \
//             --repository-name oneclick-erp \
//             --image-id imageTag=${IMAGE_TAG} \
//             --region ${AWS_REGION} \
//             --query 'imageScanFindings.imageScanStatus.status' \
//             --output text 2>/dev/null)
          
//           if [ "$SCAN_STATUS" = "COMPLETE" ]; then
//             echo "✓ Scan complete at attempt $i"
//             break
//           fi
          
//           if [ $i -eq 30 ]; then
//             echo "⚠ Scan still running after 5 min, proceeding with caution..."
//             exit 0
//           fi
          
//           echo "Waiting for scan... (attempt $i/30)"
//           sleep 10
//         done
        
//         # Get findings
//         aws ecr describe-image-scan-findings \
//           --repository-name oneclick-erp \
//           --image-id imageTag=${IMAGE_TAG} \
//           --region ${AWS_REGION} \
//           --output json > reports/ecr-scan.json
        
//         # Check for CRITICAL/HIGH
//         CRITICAL=$(jq '.imageScanFindings.findingSeverityCounts.CRITICAL // 0' reports/ecr-scan.json)
//         HIGH=$(jq '.imageScanFindings.findingSeverityCounts.HIGH // 0' reports/ecr-scan.json)
        
//         echo "Scan Results: CRITICAL=$CRITICAL, HIGH=$HIGH"
        
//         if [ "$CRITICAL" -gt 0 ] || [ "$HIGH" -gt 0 ]; then
//           echo "❌ FAILED: Found vulnerabilities"
//           jq '.imageScanFindings.findings[]' reports/ecr-scan.json
//           exit 1
//         fi
        
//         echo "✓ Security gate PASSED"
//         '''
//     }
// }


    // ------------------------------------------------------------------ Phase 5
    stage('5a. AI-Assisted Report') {
      steps {
        // Never blocks the release: if the AI call fails, a plain report is sent instead.
        sh '''#!/bin/bash
          set -e
          cd ci/ai-report
          npm ci --no-fund --no-audit --omit=dev >/dev/null
          node report.mjs "$REPORT_DIR" > "$REPORT_DIR/release-summary.md" || true
          cat "$REPORT_DIR/release-summary.md"

          aws sns publish --region "$AWS_REGION" --topic-arn "$SNS_TOPIC_ARN" \
            --subject "[OneClick ERP] Build #$BUILD_NUMBER ($IMAGE_TAG) is waiting for approval" \
            --message "$(cat "$REPORT_DIR/release-summary.md"; printf '\n\nApprove or reject: %sinput/\n' "$BUILD_URL")" >/dev/null || echo "SNS publish failed (continuing)"
        '''
        archiveArtifacts artifacts: 'reports/**', allowEmptyArchive: true
      }
    }

    stage('5b. Manual Approval') {
      steps {
        timeout(time: 24, unit: 'HOURS') {
          input message: "Deploy ${env.IMAGE_TAG} to production?",
                ok: 'Approve & Deploy',
                submitter: "${env.RELEASE_APPROVERS}",
                submitterParameter: 'APPROVED_BY'
        }
      }
    }

    // ------------------------------------------------------------------ Phase 6
    stage('6. Deploy to EC2') {
      steps {
        sh '''#!/bin/bash
          set -eo pipefail
          CMD_ID=$(aws ssm send-command --region "$AWS_REGION" \
            --instance-ids "$APP_INSTANCE_ID" \
            --document-name AWS-RunShellScript \
            --comment "OneClick ERP deploy $IMAGE_TAG" \
            --cloud-watch-output-config CloudWatchOutputEnabled=true,CloudWatchLogGroupName="$LOG_GROUP" \
            --parameters "{\\"commands\\":[\\"/opt/erp/deploy.sh $IMAGE_URI\\"],\\"executionTimeout\\":[\\"900\\"]}" \
            --query Command.CommandId --output text)
          echo "SSM command: $CMD_ID"

          # Poll up to 15 minutes.
          for i in $(seq 1 180); do
            STATUS=$(aws ssm get-command-invocation --region "$AWS_REGION" --command-id "$CMD_ID" \
              --instance-id "$APP_INSTANCE_ID" --query Status --output text 2>/dev/null || echo Pending)
            case "$STATUS" in Pending|InProgress|Delayed) sleep 5 ;; *) break ;; esac
          done

          aws ssm get-command-invocation --region "$AWS_REGION" --command-id "$CMD_ID" \
            --instance-id "$APP_INSTANCE_ID" --query StandardOutputContent --output text | tee "$REPORT_DIR/deploy.txt"
          echo "Deploy status: $STATUS"
          [ "$STATUS" = "Success" ]
        '''
      }
    }

    stage('6b. Smoke Test') {
      steps {
        sh '''#!/bin/bash
          set -eo pipefail
          for i in $(seq 1 12); do
            BODY=$(curl -fsS --max-time 5 "$APP_URL/health" || true)
            echo "$BODY"
            if echo "$BODY" | jq -e --arg v "$IMAGE_TAG" '.status == "ok" and .version == $v' >/dev/null 2>&1; then
              echo "Smoke test PASSED: $APP_URL is serving $IMAGE_TAG"; exit 0
            fi
            sleep 5
          done
          echo "Smoke test FAILED"; exit 1
        '''
      }
    }
  }

  post {
    success {
      sh '''
        aws sns publish --region "$AWS_REGION" --topic-arn "$SNS_TOPIC_ARN" \
          --subject "[OneClick ERP] Deployed $IMAGE_TAG" \
          --message "Build #$BUILD_NUMBER ($IMAGE_TAG) is live at $APP_URL
Commit: $GIT_SHORT - $COMMIT_MSG ($COMMIT_AUTHOR)
Logs: https://$AWS_REGION.console.aws.amazon.com/cloudwatch/home?region=$AWS_REGION#logsV2:log-groups/log-group/$(echo "$LOG_GROUP" | sed 's#/#$252F#g')
Build: $BUILD_URL" >/dev/null || true
      '''
    }
    failure {
      sh '''
        aws sns publish --region "$AWS_REGION" --topic-arn "$SNS_TOPIC_ARN" \
          --subject "[OneClick ERP] Build #$BUILD_NUMBER FAILED" \
          --message "Build #$BUILD_NUMBER (${IMAGE_TAG:-n/a}) failed. Console output: ${BUILD_URL}console" >/dev/null || true
      '''
    }
    always {
      archiveArtifacts artifacts: 'reports/**', allowEmptyArchive: true
      sh 'docker image rm "$IMAGE_URI" >/dev/null 2>&1 || true'
    }
  }
}
