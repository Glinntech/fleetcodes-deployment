import * as pulumi from "@pulumi/pulumi";

// Import shared infrastructure components
import { fleetMgmtVpc, publicSubnetIds } from "./cluster/vpc";
import { fleetMgmtECSCluster, albSecurityGroup, ecsInstanceSecurityGroup, clusterOutput } from "./cluster/base";
import { fleetMgmtLB, sharedHttpsListener } from "./cluster/lb";
import { sharedHostedZone, wildcardCertificate, domainName } from "./dns/route53";

// Export shared infrastructure resources for use by applications
export const sharedInfrastructure = {
    // VPC and Networking
    vpc: {
        id: fleetMgmtVpc.vpcId,
        publicSubnet1Id: fleetMgmtVpc.publicSubnetIds[0],
        publicSubnet2Id: fleetMgmtVpc.publicSubnetIds[1],
        publicSubnetIds: fleetMgmtVpc.publicSubnetIds,
    },
    
    // ECS Cluster
    ecsCluster: {
        name: fleetMgmtECSCluster.name,
        arn: fleetMgmtECSCluster.arn,
        capacityProviders: clusterOutput,
    },
    
    // Load Balancer
    loadBalancer: {
        arn: fleetMgmtLB.arn,
        dnsName: fleetMgmtLB.dnsName,
        zoneId: fleetMgmtLB.zoneId,
        securityGroupId: albSecurityGroup.id,
        httpsListenerArn: sharedHttpsListener.arn,
    },
    
    // Security Groups
    securityGroups: {
        albSecurityGroupId: albSecurityGroup.id,
        ecsInstanceSecurityGroupId: ecsInstanceSecurityGroup.id,
    },
    
    // DNS and SSL
    dns: {
        hostedZoneId: sharedHostedZone.id,
        domainName: domainName,
        wildcardCertificateArn:  wildcardCertificate.then(cert=> cert.arn),
        nameServers: sharedHostedZone.nameServers,
    },
};

// Export individual components for direct access
export {
    // VPC
    fleetMgmtVpc,
    publicSubnetIds,
    
    // ECS
    fleetMgmtECSCluster,
    clusterOutput,
    
    // Load Balancer
    fleetMgmtLB,
    sharedHttpsListener,
    
    // Security Groups
    albSecurityGroup,
    ecsInstanceSecurityGroup,
    
    // DNS
    sharedHostedZone,
    wildcardCertificate,
    domainName,

};

// Log important outputs
sharedHostedZone.nameServers.apply((nameServers: string[]) => 
    pulumi.log.info(`Shared DNS Name Servers: ${nameServers?.join(", ")}`)
);

fleetMgmtLB.dnsName.apply((dnsName: string) => 
    pulumi.log.info(`Shared Load Balancer DNS: ${dnsName}`)
);

fleetMgmtECSCluster.name.apply((clusterName: string) => 
    pulumi.log.info(`Shared ECS Cluster: ${clusterName}`)
);
