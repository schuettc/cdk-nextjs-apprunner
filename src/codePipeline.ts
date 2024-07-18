import { Construct } from 'constructs';
import { ECRRepositoryResources } from './ecrRepository';
import { Stack } from 'aws-cdk-lib';
import {
  BuildSpec,
  LinuxBuildImage,
  Project,
  Source,
} from 'aws-cdk-lib/aws-codebuild';
import { Artifact, Pipeline, PipelineType } from 'aws-cdk-lib/aws-codepipeline';
import {
  CodeBuildAction,
  S3SourceAction,
} from 'aws-cdk-lib/aws-codepipeline-actions';
import { Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Asset } from 'aws-cdk-lib/aws-s3-assets';

interface CodePipelineResourcesProps {
  ecrRepository: ECRRepositoryResources;
  dockerAsset: Asset;
}

export class CodePipelineResources extends Construct {
  public readonly pipeline: Pipeline;

  constructor(scope: Construct, id: string, props: CodePipelineResourcesProps) {
    super(scope, id);

    const { ecrRepository, dockerAsset } = props;

    const codeBuildProject = new Project(this, 'DockerBuildProject', {
      buildSpec: BuildSpec.fromObject({
        version: '0.2',
        phases: {
          pre_build: {
            commands: [
              'echo Logging in to Amazon ECR...',
              'aws ecr get-login-password --region $AWS_DEFAULT_REGION | docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.$AWS_DEFAULT_REGION.amazonaws.com',
            ],
          },
          build: {
            commands: [
              'echo Build started on `date`',
              'echo Building the Docker image...',
              'docker build -t $IMAGE_REPO_NAME:$IMAGE_TAG .',
              'docker tag $IMAGE_REPO_NAME:$IMAGE_TAG $AWS_ACCOUNT_ID.dkr.ecr.$AWS_DEFAULT_REGION.amazonaws.com/$IMAGE_REPO_NAME:$IMAGE_TAG',
            ],
          },
          post_build: {
            commands: [
              'echo Build completed on `date`',
              'echo Pushing the Docker image...',
              'docker push $AWS_ACCOUNT_ID.dkr.ecr.$AWS_DEFAULT_REGION.amazonaws.com/$IMAGE_REPO_NAME:$IMAGE_TAG',
            ],
          },
        },
      }),
      environment: {
        buildImage: LinuxBuildImage.AMAZON_LINUX_2_5,
        privileged: true,
        environmentVariables: {
          AWS_DEFAULT_REGION: { value: Stack.of(this).region },
          AWS_ACCOUNT_ID: { value: Stack.of(this).account },
          IMAGE_REPO_NAME: { value: ecrRepository.repository.repositoryName },
          IMAGE_TAG: { value: 'latest' },
        },
      },
      source: Source.s3({
        bucket: dockerAsset.bucket,
        path: dockerAsset.s3ObjectKey,
      }),
    });

    codeBuildProject.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: [
          'ecr-public:GetAuthorizationToken',
          'sts:GetServiceBearerToken',
        ],
        resources: ['*'],
      }),
    );

    ecrRepository.repository.grantPullPush(codeBuildProject.role!);
    dockerAsset.bucket.grantRead(codeBuildProject.role!);

    const sourceOutput = new Artifact();
    const buildOutput = new Artifact();

    this.pipeline = new Pipeline(this, 'Pipeline', {
      pipelineType: PipelineType.V2,
      stages: [
        {
          stageName: 'Source',
          actions: [
            new S3SourceAction({
              actionName: 'S3Source',
              bucket: dockerAsset.bucket,
              bucketKey: dockerAsset.s3ObjectKey,
              output: sourceOutput,
            }),
          ],
        },
        {
          stageName: 'Build',
          actions: [
            new CodeBuildAction({
              actionName: 'DockerBuild',
              project: codeBuildProject,
              input: sourceOutput,
              outputs: [buildOutput],
            }),
          ],
        },
      ],
    });
  }
}
