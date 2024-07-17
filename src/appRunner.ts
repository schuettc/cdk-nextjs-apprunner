import * as apprunnerAlpha from '@aws-cdk/aws-apprunner-alpha';
import { Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { ECRRepositoryResources } from './ecrRepository';

interface AppRunnerResourcesProps {
  ecrRepository: ECRRepositoryResources;
}

export class AppRunnerResources extends Construct {
  public readonly service: apprunnerAlpha.Service;

  constructor(scope: Construct, id: string, props: AppRunnerResourcesProps) {
    super(scope, id);

    const { ecrRepository } = props;

    const appRunnerRole = new Role(this, 'AppRunnerECRAccessRole', {
      assumedBy: new ServicePrincipal('build.apprunner.amazonaws.com'),
    });
    ecrRepository.repository.grantPull(appRunnerRole);

    this.service = new apprunnerAlpha.Service(this, 'Service', {
      source: apprunnerAlpha.Source.fromEcr({
        imageConfiguration: { port: 3000 },
        repository: ecrRepository.repository,
        tagOrDigest: 'latest',
      }),
      autoDeploymentsEnabled: true,
      accessRole: appRunnerRole,
    });

    this.service.addEnvironmentVariable('HOSTNAME', '0.0.0.0');
  }
}
