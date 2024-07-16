# ECS Hosted Whisper Streaming using gRPC

In this demo, we will see how to build an application that will accept streaming audio sent via Websockets and have the audio transcribed using [OpenAI Whisper](https://openai.com/research/whisper). This demo builds off of the previous [gRPC Streaming Audio with Node](https://subaud.io/blog/node-grpc-server) blog post and [hosted-whisper-streaming](https://github.com/schuettc/hosted-whisper-streaming). In this demo, the ECS uses an [EC2 based deployment that supports GPUs](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/ecs-gpu.html) and includes a client that can be used with multiple participants using the Amazon Chime SDK. This requires several changes to the deployment that will be highlighted.

## Overview

![Overview](/images/StreamingWhisperWithClient.png)

The basic concepts of the previous [gRPC Streaming Audio with Node](https://subaud.io/blog/node-grpc-server) and [hosted-whisper-streaming](https://github.com/schuettc/hosted-whisper-streaming) remain largely the same. An audio stream will be generated from a hosted Websocket client and sent to a Websockets server hosted in [Amazon Elastic Container Service (ECS)](https://aws.amazon.com/ecs/). The server will transcribe the audio and return the results to the client.

## ECS Deployment

```typescript
const cluster = new Cluster(this, 'cluster', {
  vpc: props.vpc,
});

const launchTemplate = new LaunchTemplate(this, 'LaunchTemplate', {
  machineImage: EcsOptimizedImage.amazonLinux2(AmiHardwareType.GPU),
  instanceType: new InstanceType('g4dn.2xlarge'),
  requireImdsv2: true,
  userData: UserData.forLinux(),
  securityGroup: ecsServiceSecurityGroup,
  role: ec2Role,
  blockDevices: [
    {
      deviceName: '/dev/xvda',
      volume: BlockDeviceVolume.ebs(300),
    },
  ],
});

const autoScalingGroup = new AutoScalingGroup(this, 'AutoScalingGroup', {
  vpc: props.vpc,
  launchTemplate: launchTemplate,
  desiredCapacity: 1,
  minCapacity: 1,
  maxCapacity: 2,
  vpcSubnets: { subnetType: SubnetType.PUBLIC },
});

const capacityProvider = new AsgCapacityProvider(this, 'AsgCapacityProvider', {
  autoScalingGroup,
});

cluster.addAsgCapacityProvider(capacityProvider);
```

Some changes are required in the CDK to use an EC2 based deployment of ECS. Here we see the [Launch Template](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-launch-templates.html) that defines the EC2 instance parameters. An autoscaling group is also configured to allow this demo to scale up if needed.

```typescript
const taskDefinition = new Ec2TaskDefinition(this, 'taskDefinition', {
  taskRole: hostedWhisperStreamingRole,
  networkMode: NetworkMode.BRIDGE,
});

taskDefinition.addContainer('HostedWhisperStreaming', {
  image: ContainerImage.fromAsset('src/resources/whisperServer'),
  environment: {
    ECS_LOGLEVEL: props.logLevel,
  },
  gpuCount: 1,
  memoryLimitMiB: 31690,
  cpu: 8192,
  portMappings: [{ containerPort: 50051, hostPort: 50051 }],
  logging: new AwsLogDriver({ streamPrefix: 'HostedWhisperStreaming' }),
});

this.ecsService = new Ec2Service(this, 'ECSService', {
  cluster: cluster,
  taskDefinition: taskDefinition,
  capacityProviderStrategies: [
    { capacityProvider: capacityProvider.capacityProviderName, weight: 1 },
  ],
});
```

Next we configure the [Task Definition](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task_definitions.html) that will use the included Docker container image.

## Docker Image

```Dockerfile
FROM --platform=linux/amd64 nvidia/cuda:12.2.2-cudnn8-runtime-ubuntu22.04 AS base

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3.10-dev python3-pip python3.10-venv libsndfile1 build-essential curl git  && \
    rm -rf /var/lib/apt/lists/*

FROM base AS builder

COPY src/requirements.txt ./

RUN pip3 install --upgrade pip setuptools wheel && \
    pip3 install --user -r requirements.txt && \
    pip3 install --user git+https://github.com/openai/whisper.git

FROM base
ENV MODEL=${MODEL}
ENV LOG_LEVEL=${LOG_LEVEL}

COPY --from=builder /root/.local /root/.local
COPY src/* ./
RUN chmod +x /entrypoint.sh

EXPOSE 50051

ENTRYPOINT ["/entrypoint.sh"]


```

The Dockerfile included creates a Docker image that uses the [nvidia/cuda Docker image](https://hub.docker.com/r/nvidia/cuda/) as the base. This image will allow us to use the GPUs on the EC2 instance.

The `pip3 install` commands are particularly important when using this image. These will update and install the necessary tools to install and configure Whisper. In order to ensure the model is downloaded and installed, `python3 -c "import whisper; whisper.load_model('base')"` is run as part of the build.

As part of the `entrypoint.sh` script, we will be sure to set the correct path for the cuDNN libraries.

```bash
export LD_LIBRARY_PATH=`python3 -c 'import os; import nvidia.cublas.lib; import nvidia.cudnn.lib; print(os.path.dirname(nvidia.cublas.lib.__file__) + ":" + os.path.dirname(nvidia.cudnn.lib.__file__))'`
```

This solves the `Could not load library libcudnn_ops_infer.so.8. Error: libcudnn_ops_infer.so.8: cannot open shared object file: No such file or directory` issue that is caused by the `LD_LIBRARY_PATH` not containing the correct locations for the libraries.

Finally, we will start the server.

```bash
python3 server.py
```

## Whisper Server

The Whisper server is started and audio chunks are delivered to the transcribe_handler.

```python
async def start_server():
    # Create an aiohttp application
    app = web.Application()
    app.router.add_get("/healthcheck", healthcheck)

    # Start the aiohttp server
    runner = web.AppRunner(app)
    await runner.setup()
    http_site = web.TCPSite(runner, "0.0.0.0", 8080)
    await http_site.start()
    logger.info(f"HTTP server started on http://0.0.0.0:8080")

    # Start the WebSocket server
    ws_server = await websockets.serve(transcribe_handler, "0.0.0.0", 8765)
    logger.info(f"WebSocket server started on ws://0.0.0.0:8765")

    # Run both servers concurrently
    await asyncio.gather(
        ws_server.wait_closed(), asyncio.Future()  # This will run forever
    )
```

The AudioTranscriberServicer will be used to process the audio stream and return the transcriptions to the client. Whisper does not natively support streaming audio, so we must break the streamed audio into chunks that Whisper can use. To do this, audio processor will process the audio frames and use VAD to detect speech segments. These frames are buffered until a non-speech frame is encountered. When this happens, the frames are joined into a chunk. If the chunk is long enough, it is processed by [faster-whisper](https://github.com/SYSTRAN/faster-whisper) using a model. This allows for rapid transcription of streaming audio while allowing Whisper to provide the best results.

## Notes and Warnings

Because this deployment uses GPU based instance(s), be sure to check the [prices of the instances](https://aws.amazon.com/ec2/pricing/on-demand/) that will be used.

![Pricing](/images/Pricing.png)

## Testing

This demo requires a [domain hosted in Route 53](https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/registrar.html) so that a certificate can be associated with the [Application Load Balancer](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/load-balancer-target-groups.html#target-group-protocol-version) listener. To configure the domain within the deployment, create a `.env` file with a `DOMAIN_NAME=` associated with a [Hosted Zone Name](https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/hosted-zones-working-with.html) in the account. We will also use a `HOST_NAME=` to identify the host name. The `.env` should look like this:

```
HOST_NAME=transcriber
DOMAIN_NAME=example.com
MODEL=large
```

Once the `.env` has been configured, you can deploy the CDK from the cloned repo:

```bash
yarn deploy
```

### Client

Also included is a client that can be used with multiple participants using the Amazon Chime SDK. This application is deployed to AppRunner and can be accessed by using the `HostedWhisperStreamingWithClient.AppRunnerServiceUrl` in the CDK output. To use the client, enter a number in the upper box, and click `Join Meeting`. Others can join the same meeting by entering the same number on their client.

## Translation

Also included is a mechanism to Translate the Transcript using Amazon Bedrock. In this demo, it will only translate between English and Welsh, but other languages could be configured. The client receives the transcription from the Whisper server and makes a request to Bedrock for the translation of that. Once the translation is complete, both native language and translated language are sent to the other participants through the Amazon Chime SDK data messaging feature. The result is that all parties will be able to see the original and translated language in their client.

## Cleanup

In order to delete this CDK, you should remove the Auto Scaling Group first. Once that is done, you can delete the Stack from Cloudformation.
