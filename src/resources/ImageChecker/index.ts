/* eslint-disable import/no-extraneous-dependencies */
import {
  CodePipelineClient,
  ListPipelineExecutionsCommand,
} from '@aws-sdk/client-codepipeline';
import { ECRClient, DescribeImagesCommand } from '@aws-sdk/client-ecr';
import { CdkCustomResourceEvent } from 'aws-lambda';

const codepipelineClient = new CodePipelineClient({});
const ecrClient = new ECRClient({});

export const handler = async (event: CdkCustomResourceEvent): Promise<any> => {
  const pipelineName = process.env.PIPELINE_NAME!;
  const repositoryUri = process.env.REPOSITORY_URI!;
  const imageTag = process.env.IMAGE_TAG!;

  if (event.RequestType === 'Create' || event.RequestType === 'Update') {
    try {
      // Wait for pipeline execution to complete
      await waitForPipelineExecution(pipelineName);

      // Check if the image is available in ECR
      await checkImageAvailability(repositoryUri, imageTag);

      return {
        PhysicalResourceId: `${repositoryUri}:${imageTag}`,
        Data: { ImageAvailable: true },
      };
    } catch (error) {
      throw new Error(`Failed to wait for image: ${error}`);
    }
  } else if (event.RequestType === 'Delete') {
    // Nothing to do for deletion
    return {
      PhysicalResourceId: event.PhysicalResourceId,
      Data: {},
    };
  }

  throw new Error(`Unsupported request type: ${event}`);
};

async function waitForPipelineExecution(pipelineName: string): Promise<void> {
  while (true) {
    const command = new ListPipelineExecutionsCommand({ pipelineName });
    const response = await codepipelineClient.send(command);

    if (
      response.pipelineExecutionSummaries &&
      response.pipelineExecutionSummaries.length > 0
    ) {
      const latestExecution = response.pipelineExecutionSummaries[0];
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

    await new Promise((resolve) => setTimeout(resolve, 10000)); // Wait for 10 seconds before checking again
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
