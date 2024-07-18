import { App, CfnOutput, Stack, StackProps, IgnoreMode } from 'aws-cdk-lib';
import { Asset } from 'aws-cdk-lib/aws-s3-assets';
import { Construct } from 'constructs';
import { config } from 'dotenv';
import {
  AppRunnerResources,
  ECRRepositoryResources,
  CodePipelineResources,
  ImageAvailabilityChecker,
} from '.';
config();

export class NextJSAppRunner extends Stack {
  constructor(scope: Construct, id: string, _props: StackProps) {
    super(scope, id);

    const ecrRepository = new ECRRepositoryResources(this, 'AppRunnerRepo');

    const dockerAsset = new Asset(this, 'DockerAsset', {
      path: './site',
      exclude: ['**/node_modules/**', '**/lib/**', '/**/.next/**'],
      ignoreMode: IgnoreMode.GIT,
    });

    const pipeline = new CodePipelineResources(this, 'DockerBuildPipeline', {
      ecrRepository,
      dockerAsset,
    });

    const imageChecker = new ImageAvailabilityChecker(
      this,
      'ImageAvailabilityChecker',
      {
        pipeline,
        ecrRepository,
      },
    );

    const appRunnerService = new AppRunnerResources(this, 'AppRunnerService', {
      ecrRepository,
    });

    appRunnerService.service.node.addDependency(imageChecker);

    new CfnOutput(this, 'AppServiceURL', {
      value: appRunnerService.service.serviceUrl,
    });

    new CfnOutput(this, 'ImageURI', {
      value: ecrRepository.repository.repositoryUri,
    });
  }
}

const devEnv = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
};

const app = new App();

new NextJSAppRunner(app, 'NextJSAppRunner', {
  env: devEnv,
});

app.synth();
