import * as pulumi from "@pulumi/pulumi";
import {fleetMgmtLB} from "./cluster/lb";
import {buildResult} from "./svcs/fleet-mgmt-deno-correct";
import {output} from "./svcs/fleet-mgmt-deno-correct";
import {asgAttachment} from "./cluster/base";


buildResult.image.imageUri.apply(image => pulumi.log.info(`${image}`).then(() => console.log("logged image")));

output.fleetMgmtService.name.apply(name => pulumi.log.info(`${name}`).then(() => console.log("logged service name")));
export const url = pulumi.interpolate`http://${fleetMgmtLB.dnsName}`
export const a = output.fleetMgmtService;

export const b = output.fleetMgmtTD;
b.apply(t => t.id.apply(id => pulumi.log.info(`id for td${id}`).then(() => console.log("logged id"))))

asgAttachment.capacityProviders.apply(providers => pulumi.log.info(`capacity providers name ${providers}`).then(() => console.log("capacity providers attached")))
console.log(url);