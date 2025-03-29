import * as pulumi from "@pulumi/pulumi";
import { fleetMgmtLB } from "./cluster/lb";
import { buildResult } from "./svcs/fleet-mgmt-deno-correct";
import { output } from "./svcs/fleet-mgmt-deno-correct";
import { clusterOutput } from "./cluster/base";
import { atlasIpList } from "./database/mongodb/mongodb";
import {
    certificate,
    dnsResults,
    validationRecords,
    validatonRecordForAppSubdomain,
} from "./dns/route53";

buildResult.image.imageUri.apply((image) =>
    pulumi.log.info(`${image}`).then(() => console.log("logged image"))
);

output.fleetMgmtService.name.apply((name) =>
    pulumi.log.info(`${name}`).then(() => console.log("logged service name"))
);
export const url = pulumi.interpolate`http://${fleetMgmtLB.dnsName}`;
export const a = output.fleetMgmtService;

export const b = output.fleetMgmtTD;
b.apply((t) =>
    t.id.apply((id) =>
        pulumi.log.info(`id for td${id}`).then(() => console.log("logged id"))
    )
);
atlasIpList.apply((ips) =>
    pulumi.log.info(
        `ips ${
            ips.map((it) =>
                it.ipAddress.apply((ip) =>
                    pulumi.log.info(`whitelisted ip ${ip}`)
                )
            )
        }`,
    ).then(() => console.log("ip's whitelist complete"))
);
clusterOutput.asgAttachment.capacityProviders.apply((providers) =>
    pulumi.log.info(`capacity providers name ${providers}`).then(() =>
        console.log("capacity providers attached")
    )
);
console.log(url);

dnsResults.zone.nameServers.apply((nameServers) =>
    pulumi.log.info(`Name servers: ${nameServers}`).then(() =>
        console.log("logged name servers")
    )
);

validationRecords.fqdn.apply((fqdn) =>
    pulumi.log.info(`Validation records: ${fqdn}`).then(() =>
        console.log("logged validation records")
    )
);

validatonRecordForAppSubdomain.fqdn.apply((fqdn) =>
    pulumi.log.info(`Validation record for app subdomain: ${fqdn}`).then(() =>
        console.log("logged validation record for app subdomain")
    )
);

certificate.domainName.apply((domainName) =>
    pulumi.log.info(`Certificate domain name: ${domainName}`).then(() =>
        console.log("logged certificate domain name")
    )
);

certificate.subjectAlternativeNames.apply((subjectAlternativeNames) =>
    pulumi.log.info(
        `Certificate subject alternative names: ${subjectAlternativeNames}`,
    ).then(() => console.log("logged certificate subject alternative names"))
);

export const nameServers = dnsResults.zone.nameServers;
