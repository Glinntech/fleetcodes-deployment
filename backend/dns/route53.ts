import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import { fleetMgmtLB } from "../cluster/lb";

/**
 * Creates a Route53 hosted zone for a domain
 * @param name A unique name for the Pulumi resource
 * @param domainName The domain name to create a hosted zone for (e.g., "example.com")
 * @param comment Optional comment for the hosted zone
 * @param tags Optional tags to apply to the hosted zone
 * @returns The hosted zone resource
 */

export const domainName = "hyperdecode.com";
export const appSubdomain = "app.hyperdecode.com";
export function createHostedZone(
    name: string,
    domainName: string, 
    comment?: string,
    tags?: { [key: string]: string }
): aws.route53.Zone {
    
    // Create Route53 hosted zone
    const hostedZone = new aws.route53.Zone(name, {
        name: domainName,
        comment: comment || `Hosted zone for ${domainName}`,
        tags: {
            Name: domainName,
            ...tags,
        },
    },{retainOnDelete:true});
    
    // Log the nameservers for reference
    hostedZone.nameServers.apply(nameservers => 
        pulumi.log.info(`Nameservers for ${domainName}: ${nameservers?.join(", ")}`)
    );
    
    return hostedZone;
}

/**
 * Creates a DNS record in a Route53 hosted zone
 * @param name A unique name for the Pulumi resource
 * @param zoneId The ID of the hosted zone to create the record in
 * @param recordName The name of the record (e.g., "www" for www.example.com)
 * @param type The type of the record (e.g., "A", "CNAME", "MX", etc.)
 * @param ttl The TTL for the record in seconds
 * @param records The value(s) for the record
 * @param allowOverwrite Whether to allow overwriting existing records
 * @returns The record resource
 */
export function createDnsRecord(
    name: string,
    zoneId: pulumi.Input<string>,
    recordName: string,
    type: string,
    ttl: number = 300,
    records: pulumi.Input<string>[],
    allowOverwrite: boolean = false
): aws.route53.Record {
    
    return new aws.route53.Record(name, {
        zoneId: zoneId,
        name: recordName,
        type: type,
        ttl: ttl,
        records: records,
        allowOverwrite: allowOverwrite,
    });
}

/**
 * Creates an alias record pointing to an AWS resource like ALB or CloudFront
 * @param name A unique name for the Pulumi resource
 * @param zoneId The ID of the hosted zone to create the record in
 * @param recordName The name of the record
 * @param targetZoneId The hosted zone ID of the target resource
 * @param targetDns The DNS name of the target resource
 * @param evaluateTargetHealth Whether to evaluate the health of the target
 * @returns The alias record resource
 */
export function createAliasRecord(
    name: string,
    zoneId: pulumi.Input<string>,
    recordName: string,
    targetZoneId: pulumi.Input<string>,
    targetDns: pulumi.Input<string>,
    evaluateTargetHealth: boolean = true
): aws.route53.Record {
    
    return new aws.route53.Record(name, {
        zoneId: zoneId,
        name: recordName,
        type: "A",
        aliases: [{
            name: targetDns,
            zoneId: targetZoneId,
            evaluateTargetHealth: evaluateTargetHealth,
        }],
    });
}

/**
 * Creates an alias record pointing to an Application Load Balancer
 * @param name A unique name for the Pulumi resource
 * @param zoneId The ID of the hosted zone to create the record in
 * @param recordName The name of the record
 * @param loadBalancer The ALB resource
 * @param evaluateTargetHealth Whether to evaluate the health of the target
 * @returns The alias record resource
 */
export function createAlbAliasRecord(
    name: string,
    zoneId: pulumi.Input<string>,
    recordName: string,
    loadBalancer: aws.lb.LoadBalancer,
    evaluateTargetHealth: boolean = true
): aws.route53.Record {
    
    return createAliasRecord(
        name,
        zoneId,
        recordName,
        loadBalancer.zoneId,
        loadBalancer.dnsName,
        evaluateTargetHealth
    );
}

/**
 * Creates multiple records at once in a hosted zone
 * @param zoneId The ID of the hosted zone to create the records in
 * @param records Array of record configurations
 * @returns An array of record resources
 */
export function createMultipleRecords(
    zoneId: pulumi.Input<string>,
    records: Array<{
        name: string,
        recordName: string,
        type: string,
        ttl?: number,
        records: pulumi.Input<string>[],
        allowOverwrite?: boolean
    }>
): aws.route53.Record[] {
    return records.map(record => 
        createDnsRecord(
            record.name,
            zoneId,
            record.recordName,
            record.type,
            record.ttl || 300,
            record.records,
            record.allowOverwrite || false
        )
    );
}



/**
 * Creates a Route53 Traffic Policy for advanced routing
 * @param name A unique name for the Pulumi resource
 * @param document The traffic policy document (JSON string)
 * @param comment Optional comment for the traffic policy
 * @returns The traffic policy resource
 */
export function createTrafficPolicy(
    name: string,
    document: string,
    comment?: string
): aws.route53.TrafficPolicy {
    
    return new aws.route53.TrafficPolicy(name, {
        name: name,
        document: document,
        comment: comment,
    });
}

/**
 * Example usage function that shows how to use this module
 */
export function exampleUsage() {
    // Create a hosted zone
    const exampleZone = createHostedZone(
        "example-zone",
        "example.com",
        "Example hosted zone",
        { Environment: "Production" }
    );
    
    // Create an A record
    const aRecord = createDnsRecord(
        "example-a-record",
        exampleZone.id,
        "www",
        "A",
        300,
        ["192.0.2.1", "192.0.2.2"]
    );
    
    // Create a CNAME record
    const cnameRecord = createDnsRecord(
        "example-cname-record",
        exampleZone.id,
        "blog",
        "CNAME",
        3600,
        ["www.example.com"]
    );
    
    // Create multiple records at once
    const multipleRecords = createMultipleRecords(
        exampleZone.id,
        [
            {
                name: "mail-record",
                recordName: "mail",
                type: "A",
                records: ["192.0.2.3"]
            },
            {
                name: "txt-record",
                recordName: "example.com",
                type: "TXT",
                records: ["v=spf1 include:_spf.example.com ~all"]
            }
        ]
    );
    
    // Export important outputs
    return {
        zoneId: exampleZone.id,
        nameServers: exampleZone.nameServers,
    };
}


export const dnsResults = fleetMgmtLB.dnsName.apply((dnsName) => {
    const zone = createHostedZone(
        "fleet-mgmt-zone",
        "hyperdecode.com",
        "Fleet Management Service",
        {
            deploymentType: "backend",
        },
    );

    const aliasRecord = createAliasRecord(
        "fleet-mgmt-a-record",
        zone.id,
        "app",
        fleetMgmtLB.zoneId,
        dnsName,
    );

    // // Create a CNAME record
    // const cnameRecord = createDnsRecord(
    //     "fleet-mgmt-cname-record",
    //     zone.id,
    //     "app",
    //     "CNAME",
    //     3600,
    //     [`app.hyperdecode.com`],
    // );

    return {
        zone,
        aliasRecord,
        // cnameRecord,
    };
});


// Create an ACM certificate for the domain
export const certificate = new aws.acm.Certificate("fleet-mgmt-certificate", {
    domainName: appSubdomain,
    validationMethod: "DNS",
    subjectAlternativeNames: [
        `api.${domainName}`,
        // Add any additional domains/subdomains you want to secure
        // For example: `api.${domainName}`, `*.${domainName}`
    ],
    tags: {
        Name: appSubdomain,
        Application: "Fleet Management",
    },
});

// Create DNS validation records automatically
export const validationRecords = new aws.route53.Record(
    "certificate-validation-records-api-subdomain",
    {
        zoneId: dnsResults.zone.id,
        ttl: 60,
        name: certificate.domainValidationOptions[0].resourceRecordName,
        type: certificate.domainValidationOptions[0].resourceRecordType,
        records: [certificate.domainValidationOptions[0].resourceRecordValue],
    },
    { dependsOn: [dnsResults.zone, certificate] },
);


// Create DNS validation records automatically
export const validatonRecordForAppSubdomain = new aws.route53.Record(
    "certificate-validation-records-app-subdomain",
    {
        zoneId: dnsResults.zone.id,
        ttl: 60,
        name: certificate.domainValidationOptions[1].resourceRecordName,
        type: certificate.domainValidationOptions[1].resourceRecordType,
        records: [certificate.domainValidationOptions[1].resourceRecordValue],
    },
    { dependsOn: [dnsResults.zone, certificate] },
);
