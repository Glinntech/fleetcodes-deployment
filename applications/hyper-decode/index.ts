import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

// Get configuration
const config = new pulumi.Config();
const sharedInfraStackRef = config.get("sharedInfrastructureStackRef") || "dev/shared-infrastructure";

// Reference the shared infrastructure stack
const sharedInfraStack = new pulumi.StackReference(sharedInfraStackRef);

// Get shared infrastructure outputs
const sharedInfra = sharedInfraStack.requireOutput("sharedInfrastructure");
const sharedEcsClusterName = sharedInfra.apply(infra => infra.ecsCluster.name);
const sharedEcsClusterArn = sharedInfra.apply(infra => infra.ecsCluster.arn);
const sharedSubnetIds = sharedInfra.apply(infra => infra.vpc.publicSubnetIds);
const sharedLoadBalancerArn = sharedInfra.apply(infra => infra.loadBalancer.arn);
const sharedLoadBalancerDnsName = sharedInfra.apply(infra => infra.loadBalancer.dnsName);
const sharedLoadBalancerZoneId = sharedInfra.apply(infra => infra.loadBalancer.zoneId);
const sharedHostedZoneId = sharedInfra.apply(infra => infra.dns.hostedZoneId);
const sharedCertificateArn = sharedInfra.apply(infra => infra.dns.wildcardCertificateArn);
const sharedEcsSecurityGroupId = sharedInfra.apply(infra => infra.securityGroups.ecsInstanceSecurityGroupId);
const sharedHttpsListenerArn = sharedInfra.apply(infra => infra.loadBalancer.httpsListenerArn);
const sharedInfraAsgSubnetIds = sharedInfraStack.requireOutput("clusterOutput").apply(output=>output.autoScalingGroup.vpcZoneIdentifiers);

// Application-specific configuration
const serviceName = "hyper-decode";
const containerName = "hyper-decode-container";
const containerPort = 8080;
const hyperDecodeConfig = new pulumi.Config("hyper-decode");
const appSubdomain = hyperDecodeConfig.require("appSubdomain");

// Import the application service definition (similar to fleet-mgmt)
import { createHyperDecodeService } from "./svcs/hyper-decode-service";

// Import the OSRM wrapper task definition
import { createOSRMWrapperTaskDefinition, createECSTaskRole } from "./svcs/osrm-wrapper-task-definition";

// Create OSRM wrapper task definition first
const osrmWrapperTaskRole = createECSTaskRole("osrm-wrapper");

const osrmWrapperResources = createOSRMWrapperTaskDefinition({
    serviceName: "osrm-wrapper",
    vpcId: sharedInfra.apply(infra => infra.vpc.id),
    subnetIds: sharedSubnetIds,
    ecsExecutionRoleArn: osrmWrapperTaskRole.arn,
    ecsTaskRoleArn: osrmWrapperTaskRole.arn,
});

// Create the hyper-decode service with the Fargate security group ID
const hyperDecodeService = createHyperDecodeService({
    serviceName,
    containerName,
    containerPort,
    ecsClusterName: sharedEcsClusterName,
    ecsClusterArn: sharedEcsClusterArn,
    subnetIds: sharedSubnetIds,
    securityGroupId: sharedEcsSecurityGroupId,
    loadBalancerArn: sharedLoadBalancerArn,
    certificateArn: sharedCertificateArn,
    httpsListenerArn: sharedHttpsListenerArn,
    appFqdn: `${appSubdomain}.amaan.click`,
    fargateSecurityGroupId: osrmWrapperResources.fargateSecurityGroup.id,
    osrmTaskDefinitionArn: osrmWrapperResources.taskDefinition.arn,
});

// Create DNS record for this application
const appDnsRecord = new aws.route53.Record("hyper-decode-dns-record", {
    zoneId: sharedHostedZoneId,
    name: appSubdomain,
    type: "AAAA",
    aliases: [{
        name: sharedLoadBalancerDnsName.apply(dns => `dualstack.${dns}`),
        zoneId: sharedLoadBalancerZoneId,
        evaluateTargetHealth: true,
    }],
});

// Export hyper-decode-specific outputs
export const hyperDecodeOutputs = {
    serviceName: hyperDecodeService.service.name,
    taskDefinitionArn: hyperDecodeService.taskDefinition.arn,
    targetGroupArn: hyperDecodeService.targetGroup.arn,
    listenerRuleArn: hyperDecodeService.httpsListener.arn,
    appUrl: appDnsRecord.fqdn,
    osrmWrapper: {
        taskDefinitionArn: osrmWrapperResources.taskDefinition.arn,
        clusterArn: sharedEcsClusterArn,
        efsFileSystemId: osrmWrapperResources.efsFileSystemId,
        efsSecurityGroupId: osrmWrapperResources.efsSecurityGroup.id,
        fargateSecurityGroupId: osrmWrapperResources.fargateSecurityGroup.id,
        orchestratorImageUri: osrmWrapperResources.imageResources.orchestratorImage.imageUri,
        osrmImageUri: osrmWrapperResources.imageResources.osrmImage.imageUri,
        sharedSubnetIds,
        sharedInfraAsgSubnetIds
    },
};

// Log application status
hyperDecodeService.service.name.apply((name: string) => 
    pulumi.log.info(`Hyper-Decode Service deployed: ${name}`)
);

appDnsRecord.fqdn.apply((fqdn: string) => 
    pulumi.log.info(`Hyper-Decode App URL: https://${fqdn}`)
);
