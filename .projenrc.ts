import { web, IgnoreFile } from 'projen';
const { awscdk } = require('projen');
const { JobPermission } = require('projen/lib/github/workflows-model');
const { UpgradeDependenciesSchedule } = require('projen/lib/javascript');
// const AUTOMATION_TOKEN = 'PROJEN_GITHUB_TOKEN';

const project = new awscdk.AwsCdkTypeScriptApp({
  cdkVersion: '2.118.0',
  license: 'MIT-0',
  author: 'Court Schuett',
  copyrightOwner: 'Court Schuett',
  authorAddress: 'https://subaud.io',
  appEntrypoint: 'cdk-nextjs-apprunner.ts',
  jest: false,
  projenrcTs: true,
  depsUpgradeOptions: {
    ignoreProjen: false,
    workflowOptions: {
      labels: ['auto-approve', 'auto-merge'],
      schedule: UpgradeDependenciesSchedule.WEEKLY,
    },
  },
  autoApproveOptions: {
    secret: 'GITHUB_TOKEN',
    allowedUsernames: ['schuettc'],
  },
  autoApproveUpgrades: true,
  projenUpgradeSecret: 'PROJEN_GITHUB_TOKEN',
  defaultReleaseBranch: 'main',
  name: 'cdk-nextjs-apprunner',
  deps: [
    'dotenv',
    '@aws-cdk/aws-apprunner-alpha',
    '@aws-sdk/client-codepipeline',
    '@aws-sdk/client-ecr',
    '@types/aws-lambda',
  ],
});

project.addTask('launch', {
  exec: 'yarn cdk deploy --require-approval never',
});

project.tsconfigDev.file.addOverride('include', [
  'src/**/*.ts',
  'site/**/*.ts',
  'site/**/*.tsx',
  './.projenrc.ts',
]);

project.eslint.addOverride({
  files: ['src/resources/**/*.ts'],
  rules: {
    'indent': 'off',
    '@typescript-eslint/indent': 'off',
  },
});

project.eslint.addOverride({
  files: ['src/resources/**/*.ts', 'src/*.ts', 'site/src/**/*.tsx'],
  rules: {
    '@typescript-eslint/no-require-imports': 'off',
    'import/no-extraneous-dependencies': 'off',
  },
});

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
  devDeps: ['ts-node'],
  projenDevDependency: true,
  // depsUpgrade: true,
  // depsUpgradeOptions: {
  //   taskName: 'upgrade-site',
  //   workflowOptions: {
  //     labels: ['auto-approve', 'auto-merge'],
  //     schedule: UpgradeDependenciesSchedule.WEEKLY,
  //   },
  // },
  // autoApproveOptions: {
  //   secret: 'GITHUB_TOKEN',
  //   allowedUsernames: ['schuettc'],
  // },
  // autoApproveUpgrades: true,

  deps: ['@cloudscape-design/components', '@cloudscape-design/global-styles'],
});

const common_exclude = [
  'docker-compose.yaml',
  'cdk.out',
  'cdk.context.json',
  'yarn-error.log',
  'dependabot.yml',
  '.DS_Store',
  '.env',
  '**/dist/**',
  '**/bin/**',
  '**/lib/**',
  'config.json',
];

new IgnoreFile(site, '.dockerignore', {
  ignorePatterns: [
    'node_modules',
    '.pnp',
    '.pnp.js',
    'coverage',
    '.next',
    'out',
    'build',
    '.DS_Store',
    '*.pem',
    'npm-debug.log*',
    'yarn-debug.log*',
    'yarn-error.log*',
    '.env*.local',
    '.vercel',
    '*.tsbuildinfo',
    'next-env.d.ts',
    '.git',
    '.gitignore',
    '.idea',
    '.vscode',
    '*.swp',
    '*.swo',
    '.DS_Store',
    '.DS_Store?',
    '._*',
    '.Spotlight-V100',
    '.Trashes',
    'ehthumbs.db',
    'Thumbs.db',
  ],
});

// site.synth();
const upgradeSite = project.github.addWorkflow('upgrade-site');
upgradeSite.on({ schedule: [{ cron: '0 0 * * 1' }], workflowDispatch: {} });

upgradeSite.addJobs({
  upgradeSite: {
    runsOn: ['ubuntu-latest'],
    name: 'upgrade-site',
    permissions: {
      actions: JobPermission.WRITE,
      contents: JobPermission.READ,
      idToken: JobPermission.WRITE,
    },
    steps: [
      { uses: 'actions/checkout@v3' },
      {
        name: 'Setup Node.js',
        uses: 'actions/setup-node@v3',
        with: {
          'node-version': '18',
        },
      },
      {
        run: 'yarn install --check-files --frozen-lockfile',
        workingDirectory: 'site',
      },
      { run: 'npx projen upgrade', workingDirectory: 'site' },
      {
        name: 'Create Pull Request',
        uses: 'peter-evans/create-pull-request@v4',
        with: {
          'token': '${{ secrets.PROJEN_GITHUB_TOKEN}}',
          'commit-message': 'chore: upgrade site',
          'branch': 'auto/projen-upgrade',
          'title': 'chore: upgrade site',
          'body': 'This PR upgrades site',
          'labels': 'auto-merge, auto-approve',
          'author': 'github-actions <github-actions@github.com>',
          'committer': 'github-actions <github-actions@github.com>',
          'signoff': true,
        },
      },
    ],
  },
});

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

project.gitignore.exclude(...common_exclude);

project.synth();
