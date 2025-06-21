import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import { whitelistIps } from "./database/whitelistips";

// Get configuration
const config = new pulumi.Config();
const sharedInfraStackRef = config.get("sharedInfrastructureStackRef") || "dev/shared-infrastructure";
const atlasConfig  = new pulumi.Config("atlas");
const atlasProjectId = atlasConfig.get("projectid") ;
if (!atlasProjectId) {
    throw new Error("Atlas project ID is not configured. Please set 'atlas:projectid' in your Pulumi config.");
}

// Reference the shared infrastructure stack
const sharedInfraStack = new pulumi.StackReference(sharedInfraStackRef);

// Get shared infrastructure outputs
const sharedInfra = sharedInfraStack.requireOutput("sharedInfrastructure");
const sharedSubnetIds = sharedInfra.apply(infra => infra.vpc.publicSubnetIds);
const sharedEcsClusterName = sharedInfra.apply(infra => infra.ecsCluster.name);
const sharedEcsClusterArn = sharedInfra.apply(infra => infra.ecsCluster.arn);
const sharedLoadBalancerArn = sharedInfra.apply(infra => infra.loadBalancer.arn);
const sharedLoadBalancerDnsName = sharedInfra.apply(infra => infra.loadBalancer.dnsName);
const sharedLoadBalancerZoneId = sharedInfra.apply(infra => infra.loadBalancer.zoneId);
const sharedHostedZoneId = sharedInfra.apply(infra => infra.dns.hostedZoneId);
const sharedCertificateArn = sharedInfra.apply(infra => infra.dns.wildcardCertificateArn);
const sharedEcsSecurityGroupId = sharedInfra.apply(infra => infra.securityGroups.ecsInstanceSecurityGroupId);
const sharedInfraAsgName = sharedInfraStack.requireOutput("clusterOutput").apply(output=>output.autoScalingGroup.name) as pulumi.Output<string>;
const sharedHttpsListenerArn = sharedInfra.apply(infra => infra.loadBalancer.httpsListenerArn);

// Application-specific configuration
const serviceName = "fleet-mgmt";
const containerName = "fleet-mgmt-container";
const containerPort = 8080;
const appSubdomain = "app";

// Import the application service definition (modified to accept shared infrastructure)
import { createFleetMgmtService } from "./svcs/fleet-mgmt-service";

// Create the fleet management service
const fleetMgmtService = createFleetMgmtService({
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
});

const whitelistOutput = whitelistIps(atlasProjectId,sharedInfraAsgName);


// Create DNS record for this application
const appDnsRecord = new aws.route53.Record("fleet-mgmt-dns-record", {
    zoneId: sharedHostedZoneId,
    name: appSubdomain,
    type: "A",
    aliases: [{
        name: sharedLoadBalancerDnsName.apply(dns=>`${dns}`),
        zoneId: sharedLoadBalancerZoneId,
        evaluateTargetHealth: true,
    }],
});

// Export application-specific outputs
export const fleetMgmtOutputs = {
    serviceName: fleetMgmtService.service.name,
    taskDefinitionArn: fleetMgmtService.taskDefinition.arn,
    targetGroupArn: fleetMgmtService.targetGroup.arn,
    listenerArn: fleetMgmtService.httpsListener.arn,
    appUrl: appDnsRecord.fqdn,
    asgName: sharedInfraAsgName,
};

// Log application status
fleetMgmtService.service.name.apply(name => 
    pulumi.log.info(`Fleet Management Service deployed: ${name}`)
);

appDnsRecord.fqdn.apply(fqdn => 
    pulumi.log.info(`Fleet Management App URL: https://${fqdn}`)
);
