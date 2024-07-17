import { RemovalPolicy } from 'aws-cdk-lib';
import { Repository, RepositoryProps } from 'aws-cdk-lib/aws-ecr';
import { Construct } from 'constructs';

export class ECRRepositoryResources extends Construct {
  public readonly repository: Repository;

  constructor(scope: Construct, id: string, props?: RepositoryProps) {
    super(scope, id);

    this.repository = new Repository(this, 'Repository', {
      repositoryName: props?.repositoryName || 'app-runner-repo',
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteImages: true,
      emptyOnDelete: true,
      imageScanOnPush: true,
      ...props,
    });
  }
}
