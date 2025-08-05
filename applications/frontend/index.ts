import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import { createFrontendService } from "./svcs/frontend-service";

// Get configuration
const frontendConfig = new pulumi.Config("frontend");
const sharedInfraStackRef = frontendConfig.get("sharedInfrastructureStackRef") || "dev/shared-infrastructure";

// Reference the shared infrastructure stack
const sharedInfraStack = new pulumi.StackReference(sharedInfraStackRef);

// Get shared infrastructure outputs
const sharedInfra = sharedInfraStack.requireOutput("sharedInfrastructure");
const sharedSubnetIds = sharedInfra.apply((infra: any) => infra.vpc.publicSubnetIds);
const sharedEcsClusterName = sharedInfra.apply((infra: any) => infra.ecsCluster.name);
const sharedEcsClusterArn = sharedInfra.apply((infra: any) => infra.ecsCluster.arn);
const sharedLoadBalancerArn = sharedInfra.apply((infra: any) => infra.loadBalancer.arn);
const sharedLoadBalancerDnsName = sharedInfra.apply((infra: any) => infra.loadBalancer.dnsName);
const sharedLoadBalancerZoneId = sharedInfra.apply((infra: any) => infra.loadBalancer.zoneId);
const sharedHostedZoneId = sharedInfra.apply((infra: any) => infra.dns.hostedZoneId);
const sharedCertificateArn = sharedInfra.apply((infra: any) => infra.dns.wildcardCertificateArn);
const sharedEcsSecurityGroupId = sharedInfra.apply((infra: any) => infra.securityGroups.ecsInstanceSecurityGroupId);
const sharedHttpsListenerArn = sharedInfra.apply((infra: any) => infra.loadBalancer.httpsListenerArn);

// Application-specific configuration
const serviceName = "frontend";
const containerName = "frontend-container";
const containerPort = 3000; // Default for React/Next.js apps
const appSubdomain = frontendConfig.get("appSubdomain") || "frontend";

// Create the frontend service
const frontendService = createFrontendService({
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
    appSubdomain,
});

// Create DNS record for the frontend application
const frontendDnsRecord = new aws.route53.Record("frontend-dns-record", {
    zoneId: sharedHostedZoneId,
    name: appSubdomain,
    type: "A",
    aliases: [{
        name: sharedLoadBalancerDnsName.apply((dns: any) => `${dns}`),
        zoneId: sharedLoadBalancerZoneId,
        evaluateTargetHealth: true,
    }],
});

// Export frontend-specific outputs
export const frontendOutputs = {
    serviceName: frontendService.service.name,
    taskDefinitionArn: frontendService.taskDefinition.arn,
    targetGroupArn: frontendService.targetGroup.arn,
    listenerArn: frontendService.httpsListener.arn,
    appUrl: frontendDnsRecord.fqdn,
    ecrRepositoryUrl: frontendService.buildResult.repository.repositoryUrl,
    imageUri: frontendService.buildResult.image.imageUri,
};

// Log application status
frontendService.service.name.apply((name: any) => 
    pulumi.log.info(`Frontend Service deployed: ${name}`)
);

frontendDnsRecord.fqdn.apply((fqdn: any) => 
    pulumi.log.info(`Frontend App URL: https://${fqdn}`)
);

frontendService.buildResult.repository.repositoryUrl.apply((url: any) => 
    pulumi.log.info(`Frontend ECR Repository: ${url}`)
);
