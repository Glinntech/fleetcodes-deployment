import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import { createFleetcodesAppService } from "./svcs/fleetcodes-app-service";

// Get configuration
const fleetcodesAppConfig = new pulumi.Config("fleetcodesApp");
const sharedInfraStackRef = fleetcodesAppConfig.get("sharedInfrastructureStackRef") || "dev/shared-infrastructure";

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
const serviceName = "fleetcodes-app";
const containerName = "fleetcodes-app-container";
const containerPort = 3000; // Default for Vite/React apps
const appSubdomain = fleetcodesAppConfig.get("appSubdomain") || "web";

// Create the fleetcodes-app service
const fleetcodesAppService = createFleetcodesAppService({
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

// Create DNS record for the fleetcodes-app application
const fleetcodesAppDnsRecord = new aws.route53.Record("fleetcodes-app-dns-record", {
    zoneId: sharedHostedZoneId,
    name: appSubdomain,
    type: "A",
    aliases: [{
        name: sharedLoadBalancerDnsName.apply((dns: any) => `${dns}`),
        zoneId: sharedLoadBalancerZoneId,
        evaluateTargetHealth: true,
    }],
});

// Export fleetcodes-app-specific outputs
export const fleetcodesAppOutputs = {
    serviceName: fleetcodesAppService.service.name,
    taskDefinitionArn: fleetcodesAppService.taskDefinition.arn,
    targetGroupArn: fleetcodesAppService.targetGroup.arn,
    listenerArn: fleetcodesAppService.httpsListener.arn,
    appUrl: fleetcodesAppDnsRecord.fqdn,
    ecrRepositoryUrl: fleetcodesAppService.buildResult.repository.repositoryUrl,
    imageUri: fleetcodesAppService.buildResult.image.imageUri,
};

// Log application status
fleetcodesAppService.service.name.apply((name: any) => 
    pulumi.log.info(`Fleetcodes App Service deployed: ${name}`)
);

fleetcodesAppDnsRecord.fqdn.apply((fqdn: any) => 
    pulumi.log.info(`Fleetcodes App URL: https://${fqdn}`)
);

fleetcodesAppService.buildResult.repository.repositoryUrl.apply((url: any) => 
    pulumi.log.info(`Fleetcodes App ECR Repository: ${url}`)
);

// Entry point for fleetcodes-app
console.log('Fleetcodes App started');
