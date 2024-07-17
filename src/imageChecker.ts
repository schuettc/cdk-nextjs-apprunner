import { CustomResource, Duration } from 'aws-cdk-lib';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Provider } from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';
import { CodePipelineResources } from './codePipeline';
import { ECRRepositoryResources } from './ecrRepository';

interface ImageAvailabilityCheckerProps {
  pipeline: CodePipelineResources;
  ecrRepository: ECRRepositoryResources;
  sourceHash: string;
}

export class ImageAvailabilityChecker extends Construct {
  constructor(
    scope: Construct,
    id: string,
    props: ImageAvailabilityCheckerProps,
  ) {
    super(scope, id);

    const { pipeline, ecrRepository, sourceHash } = props;

    const waitForImageLambda = new NodejsFunction(this, 'WaitForImageLambda', {
      entry: './src/resources/ImageChecker/index.ts',
      handler: 'handler',
      runtime: Runtime.NODEJS_LATEST,
      timeout: Duration.minutes(15),
      environment: {
        PIPELINE_NAME: pipeline.pipeline.pipelineName,
        REPOSITORY_URI: ecrRepository.repository.repositoryUri,
        IMAGE_TAG: 'latest',
      },
    });

    waitForImageLambda.addToRolePolicy(
      new PolicyStatement({
        actions: ['codepipeline:ListPipelineExecutions', 'ecr:DescribeImages'],
        resources: [
          pipeline.pipeline.pipelineArn,
          ecrRepository.repository.repositoryArn,
        ],
      }),
    );

    ecrRepository.repository.grantRead(waitForImageLambda);

    new CustomResource(this, 'ImageAvailabilityCheck', {
      serviceToken: new Provider(this, 'ImageAvailabilityProvider', {
        onEventHandler: waitForImageLambda,
      }).serviceToken,
      properties: {
        SourceHash: sourceHash,
      },
    });
  }
}
