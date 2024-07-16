#!/bin/bash

POLICY_ARN=$(aws iam create-policy --policy-name CDKDeployPolicy --policy-document '{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "cloudformation:*",
        "s3:*",
        "iam:*",
        "ec2:*",
        "ecs:*",
        "ecr:*",
        "logs:*",
        "ssm:*",
        "kms:*",
        "apprunner:*",
        "lambda:*",
        "apigateway:*",
        "route53:*",
        "acm:*"
      ],
      "Resource": "*"
    }
  ]
}' --query 'Policy.Arn' --output text)

echo "Created policy with ARN: $POLICY_ARN"

aws iam create-user --user-name NextJSAppRunnerCDK

aws iam attach-user-policy --user-name NextJSAppRunnerCDK --policy-arn $POLICY_ARN

KEY_OUTPUT=$(aws iam create-access-key --user-name NextJSAppRunnerCDK --query 'AccessKey.[AccessKeyId,SecretAccessKey]' --output text)

ACCESS_KEY_ID=$(echo $KEY_OUTPUT | awk '{print $1}')
SECRET_ACCESS_KEY=$(echo $KEY_OUTPUT | awk '{print $2}')

echo "Access Key ID: $ACCESS_KEY_ID"
echo "Secret Access Key: $SECRET_ACCESS_KEY"

echo "Please save these credentials securely and add them to your GitHub repository secrets."
echo "Add ACCESS_KEY_ID as AWS_ACCESS_KEY_ID"
echo "Add SECRET_ACCESS_KEY as AWS_SECRET_ACCESS_KEY"