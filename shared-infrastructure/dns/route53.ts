import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";

/**
 * Domain configuration - this should be shared across all applications
 */
export const domainName = "amaan.click";

//todo get this from pulumi config??
export const hostedZoneId = "Z0543324J3T3G1B444O8";

//hosted zone for the domain should be created manually in AWS Route53
// here we will get it using the id instead.

/**
 * Creates a Route53 hosted zone for a domain
 */
export function createHostedZone(
    name: string,
    domainName: string,
    comment?: string,
    tags?: { [key: string]: string },
): aws.route53.Zone {
    return aws.route53.Zone.get(domainName, hostedZoneId);

    // // Create Route53 hosted zone
    // const hostedZone = new aws.route53.Zone(name, {
    //     name: domainName,
    //     comment: comment || `Hosted zone for ${domainName}`,
    //     tags: {
    //         Name: domainName,
    //         ...tags,
    //     },
    // });

    // // Log the nameservers for reference
    // hostedZone.nameServers.apply((nameservers) =>
    //     pulumi.log.info(
    //         `Nameservers for ${domainName}: ${nameservers?.join(", ")}`,
    //     )
    // );

    // return hostedZone;
}

/**
 * Creates an alias record pointing to an Application Load Balancer
 */
export function createAlbAliasRecord(
    name: string,
    zoneId: pulumi.Input<string>,
    recordName: string,
    loadBalancer: aws.lb.LoadBalancer,
    evaluateTargetHealth: boolean = true,
): aws.route53.Record {
    return new aws.route53.Record(name, {
        zoneId: zoneId,
        name: recordName,
        type: "A",
        aliases: [{
            name: loadBalancer.dnsName,
            zoneId: loadBalancer.zoneId,
            evaluateTargetHealth: evaluateTargetHealth,
        }],
    });
}

// Create the shared hosted zone
export const sharedHostedZone = createHostedZone(
    "shared-hosted-zone",
    domainName,
    "Shared hosted zone for all applications",
    {
        Environment: "shared",
        Purpose: "dns",
    },
);

export const wildcardCertificate = aws.acm.getCertificate({
    domain: `*.${domainName}`,
    mostRecent: true,
});
