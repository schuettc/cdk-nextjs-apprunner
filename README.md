# NextJS App deployed to App Runner via CDK with GitHub Actions

In this demo we'll see how to deploy a NextJS application to AWS App Runner via CDK using GitHub Actions. This demo will combine and showcase several useful tools to help with deployments. Much of this could also be done using a CDK Pipeline. For smaller and simpler use cases, this can be a lighter weight way of doing it, but is more fragile. This is a simpler and cheaper version the previous [CDK Pipeline for ECS hosted NextJS App](https://subaud.io/blog/cdk-pipeline-ecs-hosted-nextjs) while still supporting the main features in it.

## Overview

![Overview](/images/Overview.png)

The core of this demo is the mechanism to take a local [NextJS](https://nextjs.org/) app, upload it to an S3 bucket, build it using Docker and deploy it to [AWS App Runner](https://aws.amazon.com/apprunner/). By using [AWS CodePipeline](https://aws.amazon.com/codepipeline/) and [AWS CodeBuild](https://aws.amazon.com/codebuild/) to build the [Docker](https://www.docker.com/) image, we eliminate the need to have Docker running locally for our deployment. This allows us to use GitHub actions to use CDK to deploy this application.

## Uploading to S3

```typescript
const dockerAsset = new Asset(this, 'DockerAsset', {
  path: './site',
  exclude: ['**/node_modules/**', '**/lib/**', '/**/.next/**'],
  ignoreMode: IgnoreMode.GIT,
});
```

By using [Asset](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_s3_assets.Asset.html) we are able to Zip and upload all of the relevant files in our NextJS application to an S3 bucket managed by CDK. We will use this S3 bucket as the trigger for our CodePipeline.

## CodePipeline

The actual pipeline for this demo is relatively simple. Using polling on the S3 bucket, it will download the Zip file from S3, extract the files, and execute a build on them.

```typescript
this.pipeline = new Pipeline(this, 'Pipeline', {
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
```

The buildSpec for this involves three basic steps:

1. Log in to ECR
2. Execute `docker build`
3. Execute `docker push`

```typescript
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
```

With these three steps, we are able to create a Docker image and push to our [Amazon ECR repository](https://docs.aws.amazon.com/ecr/). This is what will be consumed by our App Runner service.

## ImageChecker

In order to make sure the Docker image has been created and is available for the App Runner service, we will create a Lambda backed Custom Resource that will periodically check the pipeline to ensure it has completed successfully. When it has, the Customer Resource will complete and the CDK can continue. We can enforce this by adding a dependency to the Customer Resource to the App Runner service.

```typescript
appRunnerService.service.node.addDependency(imageChecker);
```

Now the CDK will not start deploying the App Runner service until the Customer Resource has completed. This will only run on the initial build. On updates, when a new image is pushed to ECR after the build process completes, App Runner will automatically deploy the updated image.

## App Runner

Finally, we will create the App Runner service and automatically deploy the image.

```typescript
this.service = new apprunnerAlpha.Service(this, 'Service', {
  source: apprunnerAlpha.Source.fromEcr({
    imageConfiguration: { port: 3000 },
    repository: ecrRepository.repository,
    tagOrDigest: 'latest',
  }),
  autoDeploymentsEnabled: true,
  accessRole: appRunnerRole,
});
```

To ensure this works correctly with NextJS we will add a `HOSTNAME` environment variable to the App Runner service.

```typescript
this.service.addEnvironmentVariable('HOSTNAME', '0.0.0.0');
```

## Projen

To help manage this project, we will be using [projen](https://projen.io/).

### Subproject

In addition to the main project, we are also using a subproject to manage the NextJS application with a `parent` of the main project.

```typescript
const site = new web.NextJsTypeScriptProject({
  parent: project,
  defaultReleaseBranch: 'main',
  name: 'cdk-nextjs-apprunner-site',
  outdir: 'site',
  projenrcTs: true,
  tailwind: false,
  tsconfig: {
    compilerOptions: {
      rootDir: '.',
      baseUrl: '.',
    },
    include: [
      'pages/**/*.ts',
      'pages/**/*.tsx',
      'components/**/*.ts',
      'components/**/*.tsx',
      '**/*.ts',
      '**/*.tsx',
      'next-env.d.ts',
    ],
    exclude: ['node_modules'],
  },
  deps: ['@cloudscape-design/components', '@cloudscape-design/global-styles'],
});

site.synth();
```

### CDK Deploy GitHub Action

Because we are using CodeBuild to build the Docker image, we can use GitHub actions to start the deploy process. To do this with projen, we will create a new workflow. This will be added to the existing actions and trigger on a merge or push to `main`.

```typescript
const cdkDeploy = project.github.addWorkflow('cdk-deploy');
cdkDeploy.on({
  push: { branches: ['main'] },
  pullRequest: { branches: ['main'], types: ['closed'] },
});

cdkDeploy.addJobs({
  deploy: {
    runsOn: ['ubuntu-latest'],
    name: 'Deploy CDK Stack',
    permissions: {
      actions: JobPermission.WRITE,
      contents: JobPermission.READ,
      idToken: JobPermission.WRITE,
    },
    if: "github.event.pull_request.merged == true || github.event_name == 'push'",
    steps: [
      { uses: 'actions/checkout@v3' },
      {
        name: 'Setup Node.js',
        uses: 'actions/setup-node@v3',
        with: {
          'node-version': '18',
        },
      },
      { run: 'yarn install --frozen-lockfile' },
      {
        name: 'Configure AWS Credentials',
        uses: 'aws-actions/configure-aws-credentials@v4',
        with: {
          'aws-access-key-id': '${{ secrets.AWS_ACCESS_KEY_ID }}',
          'aws-secret-access-key': '${{ secrets.AWS_SECRET_ACCESS_KEY }}',
          'aws-region': 'us-east-1',
          'role-session-name': 'GitHubActionsCDKDeploy',
        },
      },
      {
        name: 'CDK Diff',
        run: 'npx cdk diff',
      },
      {
        name: 'CDK Deploy',
        run: 'npx cdk deploy --all --require-approval never',
      },
    ],
  },
});
```

### AWS Credentials

In order to use this feature, you will need to create a user in your AWS account that has sufficient permissions to deploy the CDK. Using the ACCESS_KEY_ID and SECRET_ACCESS_KEY generated for this user, GitHub can deploy the CDK. To create a user with permissions you can run:

```bash
./setup_aws_cdk_deploy
```

The output will contain an ACCESS_KEY_ID and SECRET_ACCESS_KEY that can be added to your GitHub repo as secrets.

![GitHubSecrets](/images/GitHubSecrets.png)

The policy attached to this user has extensive permissions so care must be taken with this ACCESS_KEY_ID.
