import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";
import * as pulumi from "@pulumi/pulumi";
import { wrap } from "module";

// Configuration interface for OSRM wrapper task definition
export interface OSRMWrapperConfig {
    serviceName: string;
    vpcId: pulumi.Input<string>;
    subnetIds: pulumi.Input<string[]>;
    ecsExecutionRoleArn: pulumi.Input<string>;
    ecsTaskRoleArn?: pulumi.Input<string>;
}

// Create EFS mount targets and security group rules
function createEFSMountTargets(serviceName: string, efsFileSystemId: string, subnetIds: pulumi.Input<string[]>, vpcId: pulumi.Input<string>) {
    // Create security group for EFS access
    const efsSecurityGroup = new aws.ec2.SecurityGroup(`${serviceName}-efs-sg`, {
        vpcId: vpcId,
        description: "Security group for EFS NFS access",
        ingress: [{
            protocol: "tcp",
            fromPort: 2049,
            toPort: 2049,
            cidrBlocks: ["10.0.0.0/16"], // Allow from VPC CIDR
        }],
        egress: [{
            protocol: "-1",
            fromPort: 0,
            toPort: 0,
            cidrBlocks: ["0.0.0.0/0"],
        }],
        tags: {
            Name: `${serviceName}-efs-sg`,
        },
    });

    // Create mount targets for each subnet
    const mountTargets = pulumi.output(subnetIds).apply(sIds => 
        sIds.map((subnetId, index) => 
            new aws.efs.MountTarget(`${serviceName}-mount-target-${index}`, {
                fileSystemId: efsFileSystemId,
                subnetId: subnetId,
                securityGroups: [efsSecurityGroup.id],
            })
        )
    );

    return { efsSecurityGroup, mountTargets };
}

// Create Fargate security group with NFS access
function createFargateSecurityGroup(serviceName: string, vpcId: pulumi.Input<string>, efsSecurityGroupId: pulumi.Input<string>) {
    return new aws.ec2.SecurityGroup(`${serviceName}-fargate-sg`, {
        vpcId: vpcId,
        description: "Security group for Fargate tasks with EFS access",
        ingress: [
            {
                protocol: "tcp",
                fromPort: 80,
                toPort: 80,
                cidrBlocks: ["10.0.0.0/16"], // Allow HTTP from VPC
            },
            {
                protocol: "tcp",
                fromPort: 2049,
                toPort: 2049,
                securityGroups: [efsSecurityGroupId], // Allow NFS from EFS security group
            }
        ],
        egress: [
            {
                protocol: "-1",
                fromPort: 0,
                toPort: 0,
                cidrBlocks: ["0.0.0.0/0"],
            },
            {
                protocol: "-1",
                fromPort: 0,
                toPort: 0,
                ipv6CidrBlocks: ["::/0"],
            }
        ],
        tags: {
            Name: `${serviceName}-fargate-sg`,
        },
    });
}

// Create ECR repositories and build images for both containers
function createOSRMImages(serviceName: string) {
    // Get application configuration for release tag
    const osrmConfig = new pulumi.Config("osrm");
    const releaseTag = osrmConfig.require("releaseTag");

    // Create ECR repository for orchestrator container
    const orchestratorRepository = new aws.ecr.Repository(`${serviceName}-orchestrator`, {
        forceDelete: true,
        name: `${serviceName}-orchestrator`,
    });

    // Create ECR repository for OSRM backend container
    const osrmRepository = new aws.ecr.Repository(`${serviceName}-osrm-backend`, {
        forceDelete: true,
        name: `${serviceName}-osrm-backend`,
    });

    // Build and push orchestrator image
    const orchestratorImage = new awsx.ecr.Image(`${serviceName}-orchestrator`, {
        repositoryUrl: orchestratorRepository.repositoryUrl,
        context: "../../../hyperdecode/osrm-deploy", // Path to dockerfile directory
        dockerfile: "../../../hyperdecode/osrm-deploy/dockerfile", // First task dockerfile
        imageTag: `wrapper-${releaseTag}`,
        platform: "linux/arm64",
    }, { dependsOn: [orchestratorRepository] });

    // Build and push OSRM backend image
    const osrmImage = new awsx.ecr.Image(`${serviceName}-osrm-backend`, {
        repositoryUrl: osrmRepository.repositoryUrl,
        context: "../../../hyperdecode/osrm-deploy", // Path to dockerfile directory
        dockerfile: "../../../hyperdecode/osrm-deploy/osrm-dockerfile", // Second task dockerfile
        imageTag: `osrm-${releaseTag}`,
        platform: "linux/arm64",
    }, { dependsOn: [osrmRepository] });

    return {
        orchestratorRepository,
        osrmRepository,
        orchestratorImage,
        osrmImage,
    };
}

// Create the OSRM wrapper task definition
export function createOSRMWrapperTaskDefinition(config: OSRMWrapperConfig) {
    const { serviceName, vpcId, subnetIds, ecsExecutionRoleArn, ecsTaskRoleArn } = config;

    // Get EFS details from Pulumi config
    const osrmConfig = new pulumi.Config("hyper-decode");
    const efsFileSystemId = osrmConfig.require("efsFileSystemId");

    // Create EFS mount targets and security group
    const efsResources = createEFSMountTargets(serviceName, efsFileSystemId, subnetIds, vpcId);

    // Create Fargate security group with NFS access
    const fargateSecurityGroup = createFargateSecurityGroup(serviceName, vpcId, efsResources.efsSecurityGroup.id);

    // Create ECR repositories and build images
    const imageResources = createOSRMImages(serviceName);

    // Create CloudWatch log group
    const logGroup = new aws.cloudwatch.LogGroup(`${serviceName}-logs`, {
        name: `/ecs/${serviceName}`,
        retentionInDays: 7,
    });

    // Get AWS region
    const awsRegion = aws.config.region;
    const totalRam = 17408; // 17GB total RAM for the task
    const wrapperTaskRam = 256; // 384MB for orchestrator container
    const osrmTaskRam = totalRam - wrapperTaskRam; // Remaining RAM for OSRM backend container
    const osrmTaskCpu = 1792; // 1.75 vCPU for OSRM backend container
    const wrapperTaskCpu = 256; // 0.25 vCPU for orchestrator container

    // Create the task definition using the built images
    const taskDefinition = pulumi.all([
        imageResources.orchestratorImage.imageUri,
        imageResources.osrmImage.imageUri
    ]).apply(([orchestratorImageUri, osrmImageUri]) => {
        return new aws.ecs.TaskDefinition(serviceName, {
            family: serviceName,
            cpu: "4096", // 2 vCPU
            memory: `${totalRam}`, // 17GB total RAM
            requiresCompatibilities: ["FARGATE"],
            networkMode: "awsvpc",
            executionRoleArn: ecsExecutionRoleArn,
            taskRoleArn: ecsTaskRoleArn || ecsExecutionRoleArn,
            
            // Runtime platform for ARM64
            runtimePlatform: {
                cpuArchitecture: "ARM64",
                operatingSystemFamily: "LINUX",
            },

            // Ephemeral storage
            ephemeralStorage: {
                sizeInGib: 21,
            },

            // Container definitions
            containerDefinitions: JSON.stringify([
                {
                    name: "orchestrator",
                    image: orchestratorImageUri,
                    cpu: 0, // 0.25 vCPU for orchestrator
                    memory: wrapperTaskRam, // 384MB for orchestrator
                    memoryReservation: wrapperTaskRam, // 384MB for orchestrator
                    essential: true,                   
                    mountPoints: [
                        {
                            sourceVolume: "osrm-data",
                            containerPath: "/data/",
                            readOnly: false,
                        }
                    ],
                    linuxParameters: {
                        initProcessEnabled: true,
                    },
                    logConfiguration: {
                        logDriver: "awslogs",
                        options: {
                            "awslogs-group": `/ecs/${serviceName}`,
                            "mode": "non-blocking",
                            "awslogs-create-group": "true",
                            "max-buffer-size": "25m",
                            "awslogs-region": awsRegion,
                            "awslogs-stream-prefix": "ecs"
                        }
                    }
                },
                {
                    name: "osrm-backend",
                    image: osrmImageUri,
                    cpu: 0,
                    memory: osrmTaskRam, // 15.5GB for OSRM backend
                    memoryReservation: osrmTaskRam, // 15.5GB for OSRM backend
                    essential: false,
                    portMappings: [
                        {
                            name: "osrm-backend-80-tcp",
                            containerPort: 5000,
                            protocol: "tcp",
                            appProtocol: "http"
                        }
                    ],
                    mountPoints: [
                        {
                            sourceVolume: "osrm-data",
                            containerPath: "/data/",
                            readOnly: false,
                        }
                    ],
                    linuxParameters: {
                        initProcessEnabled: true,
                    },
                    readonlyRootFilesystem: false,
                    logConfiguration: {
                        logDriver: "awslogs",
                        options: {
                            "awslogs-group": `/ecs/${serviceName}`,
                            "mode": "non-blocking",
                            "max-buffer-size": "25m",
                            "awslogs-region": awsRegion,
                            "awslogs-stream-prefix": "ecs"
                        }
                    }
                }
            ]),

            // Volume configuration for EFS
            volumes: [
                {
                    name: "osrm-data",
                    efsVolumeConfiguration: {
                        fileSystemId: efsFileSystemId,
                        rootDirectory: "/osrm-backend",
                        transitEncryption: "ENABLED",
                        authorizationConfig: {
                            iam: "ENABLED",
                        },
                    },
                }
            ],

            tags: {
                Application: serviceName,
                TaskType: "osrm-wrapper",
                Architecture: "ARM64",
            },
        }, { 
            dependsOn: [
                logGroup, 
                imageResources.orchestratorImage,
                imageResources.osrmImage,
            ] 
        });
    });

    return {
        taskDefinition,
        efsFileSystemId,
        efsSecurityGroup: efsResources.efsSecurityGroup,
        fargateSecurityGroup,
        mountTargets: efsResources.mountTargets,
        logGroup,
        imageResources,
    };
}

// Create IAM role for ECS tasks (if not provided)
export function createECSTaskRole(serviceName: string) {
    const taskRole = new aws.iam.Role(`${serviceName}-task-role`, {
        assumeRolePolicy: aws.iam.assumeRolePolicyForPrincipal({
            Service: "ecs-tasks.amazonaws.com",
        }),
    });

    // Attach basic ECS task execution policy
    new aws.iam.RolePolicyAttachment(`${serviceName}-task-execution-policy`, {
        role: taskRole.name,
        policyArn: aws.iam.ManagedPolicy.AmazonECSTaskExecutionRolePolicy,
    });

    // Add EFS access policy
    const efsPolicy = new aws.iam.Policy(`${serviceName}-efs-policy`, {
        policy: JSON.stringify({
            Version: "2012-10-17",
            Statement: [
                {
                    Effect: "Allow",
                    Action: [
                        "elasticfilesystem:ClientMount",
                        "elasticfilesystem:ClientWrite",
                        "elasticfilesystem:ClientRootAccess",
                        "elasticfilesystem:DescribeFileSystems",
                        "elasticfilesystem:DescribeMountTargets"
                    ],
                    Resource: "*"
                }
            ]
        })
    });

    new aws.iam.RolePolicyAttachment(`${serviceName}-efs-policy-attachment`, {
        role: taskRole.name,
        policyArn: efsPolicy.arn,
    });

    // Add ECS Execute permissions for SSM
    const ecsExecutePolicy = new aws.iam.Policy(`${serviceName}-ecs-execute-policy`, {
        policy: JSON.stringify({
            Version: "2012-10-17",
            Statement: [
                {
                    Effect: "Allow",
                    Action: [
                        "ssmmessages:CreateControlChannel",
                        "ssmmessages:CreateDataChannel",
                        "ssmmessages:OpenControlChannel",
                        "ssmmessages:OpenDataChannel"
                    ],
                    Resource: "*"
                }
            ]
        })
    });

    new aws.iam.RolePolicyAttachment(`${serviceName}-ecs-execute-policy-attachment`, {
        role: taskRole.name,
        policyArn: ecsExecutePolicy.arn,
    });

    return taskRole;
}