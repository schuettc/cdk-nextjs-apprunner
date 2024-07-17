/* eslint-disable import/no-extraneous-dependencies */
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as apprunnerAlpha from '@aws-cdk/aws-apprunner-alpha';
import { CustomResource, Duration, RemovalPolicy, Stack } from 'aws-cdk-lib';
import {
  Project,
  BuildSpec,
  Source,
  LinuxBuildImage,
} from 'aws-cdk-lib/aws-codebuild';
import { Artifact, Pipeline, PipelineType } from 'aws-cdk-lib/aws-codepipeline';
import {
  CodeBuildAction,
  S3SourceAction,
} from 'aws-cdk-lib/aws-codepipeline-actions';
import { Repository } from 'aws-cdk-lib/aws-ecr';
import {
  Effect,
  PolicyStatement,
  Role,
  ServicePrincipal,
} from 'aws-cdk-lib/aws-iam';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Asset } from 'aws-cdk-lib/aws-s3-assets';
import { Provider } from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';

export class AppRunnerResources extends Construct {
  appRunnerService: apprunnerAlpha.Service;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    const ecrRepository = new Repository(this, 'AppRunnerRepo', {
      repositoryName: 'app-runner-repo',
      removalPolicy: RemovalPolicy.DESTROY,
      emptyOnDelete: true,
      imageScanOnPush: true,
    });

    const dockerAsset = new Asset(this, 'DockerAsset', {
      path: './site',
    });

    const sourceHash = this.calculateSourceHash('./site');

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
          IMAGE_REPO_NAME: { value: ecrRepository.repositoryName },
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

    ecrRepository.grantPullPush(codeBuildProject.role!);
    dockerAsset.bucket.grantRead(codeBuildProject.role!);

    const sourceOutput = new Artifact();
    const buildOutput = new Artifact();

    const pipeline = new Pipeline(this, 'DockerBuildPipeline', {
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

    const waitForImageLambda = new NodejsFunction(this, 'WaitForImageLambda', {
      entry: './src/resources/ImageChecker/index.ts',
      handler: 'handler',
      runtime: Runtime.NODEJS_LATEST,
      timeout: Duration.minutes(15),
      environment: {
        PIPELINE_NAME: pipeline.pipelineName,
        REPOSITORY_URI: ecrRepository.repositoryUri,
        IMAGE_TAG: 'latest',
      },
    });

    waitForImageLambda.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['codepipeline:ListPipelineExecutions', 'ecr:DescribeImages'],
        resources: [pipeline.pipelineArn, ecrRepository.repositoryArn],
      }),
    );

    ecrRepository.grantRead(waitForImageLambda);

    const imageAvailabilityCheck = new CustomResource(
      this,
      'ImageAvailabilityCheck',
      {
        serviceToken: new Provider(this, 'ImageAvailabilityProvider', {
          onEventHandler: waitForImageLambda,
        }).serviceToken,
        properties: {
          SourceHash: sourceHash,
        },
      },
    );

    const appRunnerRole = new Role(this, 'AppRunnerECRAccessRole', {
      assumedBy: new ServicePrincipal('build.apprunner.amazonaws.com'),
    });
    ecrRepository.grantPull(appRunnerRole);

    this.appRunnerService = new apprunnerAlpha.Service(
      this,
      'AppRunnerService',
      {
        source: apprunnerAlpha.Source.fromEcr({
          imageConfiguration: {
            port: 3000,
          },
          repository: ecrRepository,
          tagOrDigest: 'latest',
        }),
        autoDeploymentsEnabled: false,
        accessRole: appRunnerRole,
      },
    );
    this.appRunnerService.addEnvironmentVariable('HOSTNAME', '0.0.0.0');
    this.appRunnerService.addEnvironmentVariable('SOURCE_HASH', sourceHash);

    this.appRunnerService.node.addDependency(imageAvailabilityCheck);
  }

  private calculateSourceHash(directory: string): string {
    const hash = crypto.createHash('md5');
    const files = this.getAllFiles(directory);
    files.forEach((file) => {
      const content = fs.readFileSync(file);
      hash.update(content);
    });
    return hash.digest('hex');
  }

  private getAllFiles(directory: string): string[] {
    let results: string[] = [];
    const files = fs.readdirSync(directory);
    for (const file of files) {
      const filePath = path.join(directory, file);
      const stat = fs.statSync(filePath);
      if (stat.isDirectory()) {
        results = results.concat(this.getAllFiles(filePath));
      } else {
        results.push(filePath);
      }
    }
    return results;
  }
}
