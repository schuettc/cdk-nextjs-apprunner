import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
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

    const sourceHash = this.calculateSourceHash('./site');

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
        sourceHash,
      },
    );

    const appRunnerService = new AppRunnerResources(this, 'AppRunnerService', {
      ecrRepository,
      sourceHash,
    });

    appRunnerService.service.node.addDependency(imageChecker);

    new CfnOutput(this, 'AppServiceURL', {
      value: appRunnerService.service.serviceUrl,
    });
    new CfnOutput(this, 'SourceHash', { value: sourceHash });
    new CfnOutput(this, 'ImageURI', {
      value: ecrRepository.repository.repositoryUri,
    });
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

const devEnv = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
};

const app = new App();

new NextJSAppRunner(app, 'NextJSAppRunner', {
  env: devEnv,
});

app.synth();
