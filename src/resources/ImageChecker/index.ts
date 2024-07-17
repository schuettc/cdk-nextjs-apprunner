import {
  CodePipelineClient,
  ListPipelineExecutionsCommand,
  PipelineExecutionSummary,
} from '@aws-sdk/client-codepipeline';
import { ECRClient, DescribeImagesCommand } from '@aws-sdk/client-ecr';
import { CdkCustomResourceEvent, CdkCustomResourceResponse } from 'aws-lambda';

const codepipelineClient = new CodePipelineClient({});
const ecrClient = new ECRClient({});

export const handler = async (
  event: CdkCustomResourceEvent,
): Promise<CdkCustomResourceResponse> => {
  const pipelineName = process.env.PIPELINE_NAME!;
  const repositoryUri = process.env.REPOSITORY_URI!;
  const imageTag = process.env.IMAGE_TAG!;

  if (event.RequestType === 'Create') {
    try {
      // Get the current latest execution before triggering a new one
      // const latestExecutionBefore = await getLatestExecution(pipelineName);

      // For update, we need to wait for a new execution to start
      // if (event.RequestType === 'Update') {
      //   console.log('Waiting for a new pipeline execution to start...');
      //   await waitForNewExecution(pipelineName, latestExecutionBefore);
      // }

      await waitForPipelineExecution(pipelineName);
      await checkImageAvailability(repositoryUri, imageTag);

      return {
        PhysicalResourceId: `${repositoryUri}:${imageTag}`,
        Status: 'SUCCESS',
        Data: { ImageAvailable: true },
      };
    } catch (error) {
      console.error('Error in handler:', error);
      return {
        PhysicalResourceId: `${repositoryUri}:${imageTag}`,
        Status: 'FAILED',
        Reason: `Failed to wait for image: ${error}`,
      };
    }
  } else {
    return {
      PhysicalResourceId: event.PhysicalResourceId,
      Status: 'SUCCESS',
      Data: {},
    };
  }
};

async function getLatestExecution(
  pipelineName: string,
): Promise<PipelineExecutionSummary | null> {
  const command = new ListPipelineExecutionsCommand({ pipelineName });
  const response = await codepipelineClient.send(command);
  return response.pipelineExecutionSummaries?.[0] || null;
}

// async function waitForNewExecution(
//   pipelineName: string,
//   previousExecution: PipelineExecutionSummary | null,
// ): Promise<void> {
//   while (true) {
//     const latestExecution = await getLatestExecution(pipelineName);
//     if (
//       latestExecution &&
//       (!previousExecution ||
//         latestExecution.pipelineExecutionId !==
//           previousExecution.pipelineExecutionId)
//     ) {
//       console.log('New pipeline execution started');
//       return;
//     }
//     await new Promise((resolve) => setTimeout(resolve, 10000));
//   }
// }

async function waitForPipelineExecution(pipelineName: string): Promise<void> {
  while (true) {
    const latestExecution = await getLatestExecution(pipelineName);
    if (latestExecution) {
      if (latestExecution.status === 'Succeeded') {
        console.log('Pipeline execution succeeded');
        return;
      } else if (
        latestExecution.status === 'Failed' ||
        latestExecution.status === 'Stopped'
      ) {
        throw new Error(`Pipeline execution ${latestExecution.status}`);
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 10000));
  }
}

async function checkImageAvailability(
  repositoryUri: string,
  imageTag: string,
): Promise<void> {
  const [repositoryName] = repositoryUri.split('/').slice(-1);
  try {
    const command = new DescribeImagesCommand({
      repositoryName: repositoryName,
      imageIds: [{ imageTag: imageTag }],
    });
    await ecrClient.send(command);
    console.log('Image is available in ECR');
  } catch (error) {
    throw new Error('Image not available in ECR');
  }
}
