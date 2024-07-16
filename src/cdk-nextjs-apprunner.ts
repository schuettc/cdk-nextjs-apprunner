import { App, CfnOutput, Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { config } from 'dotenv';
import { AppRunnerResources } from '.';
config();

export class NextJSAppRunner extends Stack {
  constructor(scope: Construct, id: string, _props: StackProps) {
    super(scope, id);

    const appRunnerResources = new AppRunnerResources(
      this,
      'AppRunnerResources',
    );

    new CfnOutput(this, 'AppRunnerServiceUrl', {
      value: appRunnerResources.appRunnerService.serviceUrl,
      description: 'URL of the App Runner service',
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
